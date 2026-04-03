import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';

const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-dev-secret-change-in-production';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export { cookieParser };

export const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  cookieName: IS_PRODUCTION ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    secure: IS_PRODUCTION,
    httpOnly: true,
  },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});
