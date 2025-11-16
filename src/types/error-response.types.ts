export interface FieldError {
  field?: string;
  message: string;
}

export interface ProblemDetails {
  title: string;
  status: number;
  detail: string;
}

export interface ApiErrorResponse extends ProblemDetails {
  errors: FieldError[];
}
