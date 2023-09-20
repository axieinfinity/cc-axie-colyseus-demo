import { Client, Room } from '@colyseus/core';
import { GameRoomState, PlayerState, Projectile } from './schema/GameRoomState';
import { GamePhase } from './GamePhases';

export const GameRoomConfig = {
    MOVE_SPEED: 150,
    FIELD_WIDTH: 1800,
    TIME_PER_TURN: 20,
    MAX_PLAYER: 2,
    GRAVITY: 1000,
    POWER_BASE: 2000,
    HIT_RADIUS: 80,
}

export class GameRoom extends Room<GameRoomState> {

    onCreate(options: any) {
        this.maxClients = GameRoomConfig.MAX_PLAYER;
        this.setState(new GameRoomState());

        this.onMessage('start-move', this.handleStartMoveMsg.bind(this));
        this.onMessage('stop-move', this.handleStopMoveMsg.bind(this));
        this.onMessage('fire', this.handleFireMsg.bind(this));

        this.setSimulationInterval(this.update.bind(this));
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, 'joined!');
        //spawn player
        let newPlayer = new PlayerState().assign({
            sessionId: client.sessionId,
            x: (Math.random() * GameRoomConfig.FIELD_WIDTH) - (GameRoomConfig.FIELD_WIDTH / 2), // [-600, 600];
            isAlive: true,
            faceDirection: 1,
            isMoving: false,
        });
        console.log('New player spawned', newPlayer.toJSON());
        this.state.players.push(newPlayer);

        //trigger first turn if there is 2 players
        if (this.hasReachedMaxClients()) {
            this.lock();
            this.state.phase = GamePhase.INGAME;
            this.enterTurn(0);
            console.log('enter turn');
        }
    }

    onLeave(client: Client, consented: boolean) {
        //determine other player as winner
        for (let c of this.clients) {
            if (c.sessionId != client.sessionId) {
                this.state.winner = c.sessionId;
                break;
            }
        }
    }

    handleStartMoveMsg(client: Client, msg: any) {
        console.log('Handle start move', msg);
        let direction = msg.direction;
        if (direction !== 1 && direction !== -1) return;

        let playerIndex = this.state.players.findIndex(player => player.sessionId == client.sessionId);
        if (playerIndex != this.state.currTurn) return;

        let player = this.state.players[playerIndex];
        player.faceDirection = direction;
        player.isMoving = true;
    }

    handleStopMoveMsg(client: Client, msg: any) {
        console.log('Handle stop move');
        let playerIndex = this.state.players.findIndex(player => player.sessionId == client.sessionId);
        if (playerIndex != this.state.currTurn) return;

        let player = this.state.players[playerIndex];
        player.isMoving = false;
    }


    handleFireMsg(client: Client, msg: any) {
        let degAngle = msg.angle;
        if (degAngle < 0) degAngle += 180;
        let powerRatio = msg.powerRatio;

        if (isNaN(powerRatio) || isNaN(degAngle)) return;
        if (this.state.projectile != null) return;

        let playerIndex = this.state.players.findIndex(player => player.sessionId == client.sessionId);
        if (playerIndex != this.state.currTurn) return;

        let player = this.state.players[playerIndex];
        let radAngle = Math.PI * degAngle / 180;
        let newProjectile = new Projectile().assign({
            x: player.x,
            y: 0,
            vx: Math.cos(radAngle) * powerRatio * GameRoomConfig.POWER_BASE,
            vy: Math.sin(radAngle) * powerRatio * GameRoomConfig.POWER_BASE
        });
        this.state.projectile = newProjectile;
    }

    update(msDt: number) {
        let secDt = msDt / 1000;
        let currTurn = this.state.currTurn;

        if (this.state.phase == GamePhase.INGAME) {
            //update projectile
            if (this.state.projectile != null) {
                let { vx, vy } = this.state.projectile;
                this.state.projectile.x += vx * secDt;
                this.state.projectile.y += vy * secDt;
                this.state.projectile.vx += this.state.wind * secDt;
                this.state.projectile.vy += -GameRoomConfig.GRAVITY * secDt;

                if (this.state.projectile.y < 0) {
                    let ax = this.state.projectile.x;
                    this.state.players.forEach(player => {
                        let bx = player.x;
                        let distance = Math.abs(ax - bx);
                        if (distance <= GameRoomConfig.HIT_RADIUS) {
                            player.isAlive = false;
                        }
                    });

                    this.state.projectile = null;
                    this.enterTurn(1 - currTurn);
                }
            }

            //update players
            let playingPlayerState = this.state.players[this.state.currTurn];
            if (playingPlayerState.isMoving) {
                let offset = GameRoomConfig.MOVE_SPEED * playingPlayerState.faceDirection * secDt;
                playingPlayerState.x += offset;
                console.log('move player', offset, secDt);
            }

            // reduce time countdown -> change turn if timeout
            if (this.state.secondsLeft <= 0) {
                this.enterTurn(1 - currTurn);
            }
            else {
                this.state.secondsLeft -= secDt;
            }

            //check number of player alive, if there only one, announce winner
            let alivePlayers: string[] = [];
            this.state.players.forEach(player => {
                if (player.isAlive == true) alivePlayers.push(player.sessionId);
            });

            if (alivePlayers.length == 1) {
                this.state.phase = GamePhase.ENDED;
                this.state.winner = alivePlayers[0];
            }
            else if (alivePlayers.length == 0) {
                this.state.phase = GamePhase.DRAW;
            }
        }
    }

    enterTurn(playerIndex: number) {
        this.state.currTurn = playerIndex;
        this.state.secondsLeft = GameRoomConfig.TIME_PER_TURN;
        //halt all player movement
        this.state.players.forEach(player => player.isMoving = false);
        this.state.wind = 0;
        this.state.projectile = null;
    }
}
