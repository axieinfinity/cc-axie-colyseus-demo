import { ArraySchema, Schema, type } from '@colyseus/schema';
import { GamePhase } from '../GamePhases';

export class Projectile extends Schema {
    @type('number') x: number = 0;
    @type('number') y: number = 0;
    @type('number') vx: number = 0;
    @type('number') vy: number = 0;
}

export class PlayerState extends Schema {
    @type('string') sessionId: string = '';

    @type('number') x: number = 0;
    @type('boolean') isAlive: boolean = false;

    @type('number') faceDirection: number = 1;
    @type('boolean') isMoving: boolean = false;
}

export class GameRoomState extends Schema {
    @type('number') phase: GamePhase = GamePhase.WAITING;

    @type(Projectile) projectile: Projectile = null;
    @type([PlayerState]) players: ArraySchema<PlayerState> = new ArraySchema<PlayerState>();

    @type('number') secondsLeft: number = 0;
    @type('number') currTurn: number = 0;

    @type('string') winner: string = '';
}
