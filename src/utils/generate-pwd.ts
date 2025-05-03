export function generateRandomPassword(length: number = 10): string {
  const uppercaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseLetters = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specialCharacters = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Combine all characters into one string
  const allCharacters =
    uppercaseLetters + lowercaseLetters + digits + specialCharacters;

  // Generate a random password
  let password = '';
  for (let i = 0; i < length; i++) {
    // Get a random index from the character set
    const randomIndex = Math.floor(Math.random() * allCharacters.length);
    // Append the character at the random index to the password
    password += allCharacters[randomIndex];
  }

  return password;
}
