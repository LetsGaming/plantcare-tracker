interface LoginData {
  username: string;
  password: string;
}

interface RegisterData extends LoginData {}

interface LoginResponse {
  accessToken: string;
}

interface EditProfile {
  username?: string;
  password?: string;
  passwordConfirmation?: string;
}
