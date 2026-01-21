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

type UserRole = "admin" | "user" | "guest";

interface AuthToken {
  id: number;
  username: string;
  role: UserRole;
}
