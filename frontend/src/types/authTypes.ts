interface LoginData {
  username: string;
  password: string;
}

interface RegisterData extends LoginData {

}

interface AuthResponse {
  accessToken: string;
  // Add other fields as necessary
}
