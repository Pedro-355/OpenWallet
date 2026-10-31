export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} não encontrado`);
export const unauthorized = (msg = 'Não autenticado') => new HttpError(401, 'unauthorized', msg);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
