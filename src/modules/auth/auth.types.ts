export interface LoginDto {
    login: string;
    password: string;
  }
  
  export interface RegisterDto {
    login: string;
    password: string;
    fullName: string;
    position?: string;
  }
  
  export interface ChangePasswordDto {
    oldPassword: string;
    newPassword: string;
  }
  
  export interface TokenPayload {
    userId: string;
    login: string;
    role: string;
  }
  
  export interface AuthResponse {
    user: {
      id: string;
      login: string;
      fullName: string;
      role: string;
      position?: string | null;
    };
    accessToken: string;
  }