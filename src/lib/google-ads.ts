export const getGoogleAdsAuthUrl = (state: string) => {
  const baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const redirectUri = `${typeof window !== 'undefined' ? window.location.origin : ''}/settings/ads/callback`;
  
  const params = new URLSearchParams({
    client_id: clientId || "",
    response_type: "code",
    // openid email: o e-mail da conta que conectou (google-ads-mcc-configuracoes)
    scope: "openid email https://www.googleapis.com/auth/datamanager",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: redirectUri,
    state: state
  });

  return `${baseUrl}?${params.toString()}`;
};
