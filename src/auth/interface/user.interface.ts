import { JwtStrategy } from '../strategy/jwt.strategy';

export type User = Awaited<ReturnType<JwtStrategy['validate']>>;
