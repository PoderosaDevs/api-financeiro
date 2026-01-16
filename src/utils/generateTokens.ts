import jwt from 'jsonwebtoken'
import { jwtConfig } from '../config/jwt'

export function generateTokens(userId: string) {
  const accessToken = jwt.sign({}, jwtConfig.accessSecret, {
    subject: userId, // Isso preenche o 'sub' automaticamente
    expiresIn: jwtConfig.accessExpiresIn
  })

  const refreshToken = jwt.sign({}, jwtConfig.refreshSecret, {
    subject: userId, // Isso preenche o 'sub' automaticamente
    expiresIn: jwtConfig.refreshExpiresIn
  })

  return { accessToken, refreshToken }
}
