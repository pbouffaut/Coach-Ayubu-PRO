/**
 * Opens the user's email client with a pre-filled email containing login credentials.
 * Uses mailto: — no external service needed.
 */
export function sendCredentialsEmail(
  to: string,
  firstName: string,
  code: string,
  password: string,
  role: 'client' | 'coach'
) {
  const appUrl = window.location.origin;
  const roleLabel = role === 'coach' ? 'Coach' : 'Athlète';

  const subject = `Vos identifiants Coach Ayubu PRO`;

  const body = `Bonjour ${firstName},

Votre compte ${roleLabel} sur Coach Ayubu PRO a été créé.

Voici vos identifiants de connexion :

Code : ${code}
Mot de passe : ${password}

Pour vous connecter :
1. Rendez-vous sur ${appUrl}
2. Cliquez sur "Utiliser un code client"
3. Entrez votre code et mot de passe

Nous vous recommandons de ne pas partager ces identifiants.

Bon entraînement !
L'équipe Coach Ayubu PRO`;

  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(mailtoUrl, '_blank');
}
