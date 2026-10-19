import { describe, it, expect } from 'vitest';
import { TenantService } from './api';

// spec: gestao-de-acesso-f5 RF-07. A equipe é gerida no Portal do Cliente; as
// rotas /tenant/users saíram da API, e os métodos que as chamavam saem daqui.
describe('TenantService sem a equipe antiga do CRM', () => {
  it('não tem os métodos de /tenant/users', () => {
    for (const metodo of ['listUsers', 'addUser', 'updateUserRole', 'removeUser']) {
      expect(TenantService).not.toHaveProperty(metodo);
    }
  });
});
