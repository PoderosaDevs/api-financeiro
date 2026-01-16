import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { jwtConfig } from '../config/jwt'

export function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token missing' });
  }

  // Validação mais segura do formato "Bearer TOKEN"
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Token error: Format should be "Bearer <token>"' });
  }

  const [, token] = parts;

  try {
    const decoded = jwt.verify(token, jwtConfig.accessSecret);
    
    // O 'sub' no JWT costuma ser o ID do usuário
    req.userId = (decoded as any).sub;

    return next();
  } catch (err: any) {
    // Caso queira diferenciar token expirado para o front-end
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}
