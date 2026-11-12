/// <reference lib="webworker" />

// Custom Service Worker for Push Notifications
// This file will be compiled by next-pwa

import { urlParaAbrir } from '../lib/destinoDaNotificacao';

const swSelf = (self as unknown) as ServiceWorkerGlobalScope;

swSelf.addEventListener('push', (event) => {
  console.log('[SW] Evento de Push recebido.');
  
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    console.warn('[SW] Permissão de notificação não concedida ou não suportada.');
    return;
  }

  let data: { title: string; body: string; url?: string } = {
    title: 'Nova Notificação',
    body: 'Você recebeu uma atualização no Unum CRM.',
  };

  try {
    if (event.data) {
      const rawData = event.data.text();
      console.log('[SW] Dados brutos recebidos:', rawData);
      data = JSON.parse(rawData);
    } else {
      console.log('[SW] Push recebido sem dados (payload vazio).');
    }
  } catch (err) {
    console.error('[SW] Erro ao processar dados do push (JSON inválido?):', err);
    // Mantém os dados default se falhar o parse
  }

  const options: NotificationOptions = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-96x96.png',
    data: typeof data.url === 'string' && data.url.length > 0 ? { url: data.url } : {},
  };

  event.waitUntil(
    swSelf.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] Notificação exibida com sucesso.'))
      .catch(err => console.error('[SW] Erro ao exibir notificação:', err))
  );
});

swSelf.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // D-F3-5: data.url quando a notificação traz; sem url, /kanban.
  const urlToOpen = urlParaAbrir(event.notification.data, swSelf.location.origin);
  console.log('[SW] Notificação clicada. Abrindo', urlToOpen);

  event.waitUntil(
    swSelf.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(swSelf.location.origin) && 'navigate' in client) {
          console.log('[SW] Janela encontrada. Navegando para', urlToOpen);
          return client.navigate(urlToOpen).then((c) => c?.focus());
        }
      }

      if (swSelf.clients.openWindow) {
        console.log('[SW] Nenhuma janela. Abrindo', urlToOpen);
        return swSelf.clients.openWindow(urlToOpen);
      }
    })
  );
});
