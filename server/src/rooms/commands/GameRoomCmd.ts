import { Command } from '@colyseus/command';
import { Client } from 'colyseus';
import { GameRoom, GameRoomConfig } from '../GameRoom';
import { Projectile } from '../schema/GameRoomState';

export class CmdStartMove extends Command<GameRoom, {
    client: Client;
    direction: number;
}> {
    validate(payload: any): boolean {
        if (payload.direction !== 1 && payload.direction !== -1) return false;

        let playerIndex = this.state.players.findIndex(
            player => player.sessionId == payload.client.sessionId
        );
        return playerIndex == this.state.currTurn;
    }

    execute(payload: any) {
        let player = this.state.players.find(
            player => player.sessionId == payload.client.sessionId
        );
        player.faceDirection = payload.direction;
        player.isMoving = true;
    }
}


export class CmdStopMove extends Command<GameRoom, {
    client: Client;
}> {
    validate(payload: any): boolean {
        let playerIndex = this.state.players.findIndex(
            player => player.sessionId == payload.client.sessionId
        );
        return playerIndex == this.state.currTurn;
    }

    execute(payload: any) {
        let player = this.state.players.find(
            player => player.sessionId == payload.client.sessionId
        );
        player.isMoving = false;
    }
}

export class CmdFire extends Command<GameRoom, {
    client: Client;
    degAngle: number;
    powerRatio: number;
}> {
    validate(payload: any): boolean {
        if (isNaN(payload.powerRatio) || isNaN(payload.degAngle)) return false;
        if (this.state.projectile != null) return false;

        let playerIndex = this.state.players.findIndex(
            player => player.sessionId == payload.client.sessionId
        );
        return playerIndex == this.state.currTurn;
    }

    execute(payload: any) {
        let degAngle = payload.degAngle;
        if (degAngle < 0) degAngle += 180; //Cocos' angle system is different from Colyseus angle system
        let powerRatio = payload.powerRatio;

        let player = this.state.players.find(
            player => player.sessionId == payload.client.sessionId
        );
        let radAngle = Math.PI * degAngle / 180;
        let newProjectile = new Projectile().assign({
            x: player.x,
            y: 0,
            vx: Math.cos(radAngle) * powerRatio * GameRoomConfig.POWER_BASE,
            vy: Math.sin(radAngle) * powerRatio * GameRoomConfig.POWER_BASE
        });
        this.state.projectile = newProjectile;
    }
}


