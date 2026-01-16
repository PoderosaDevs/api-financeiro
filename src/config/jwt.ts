import { StringValue } from 'ms'

export const jwtConfig = {
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,

  accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN as StringValue,
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN as StringValue,
}
