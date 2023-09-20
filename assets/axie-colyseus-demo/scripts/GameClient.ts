import { _decorator, Component, EventKeyboard, Input, input, KeyCode, Label, Node, ProgressBar, sp } from 'cc';
import Colyseus from 'db://colyseus-sdk/colyseus.js';
import { GamePhase } from './GamePhases';
const { ccclass, property } = _decorator;

@ccclass('GameClient')
export class GameClient extends Component {
    @property hostname = 'localhost'!;
    @property port = 2567!;
    @property useSSL = false!;
    @property gameRoom: string = 'game_room'!;

    @property(Node) projectile: Node = null!;
    @property([sp.Skeleton]) axieSpines: sp.Skeleton[] = []!;
    @property(Label) labelCountdown: Label = null!;
    @property(Label) labelCurrTurn: Label = null!;
    @property(ProgressBar) pbPowerRatio: ProgressBar = null!;
    @property(Node) meIndicator: Node = null!;
    @property speedStakePower: number = 0.2!;
    @property(Node) panelEnd: Node = null!;
    @property(Label) labelEnd: Label = null!;

    client: Colyseus.Client = null;
    room: Colyseus.Room = null;

    powerRatio: number = 0;
    isStakingPower: boolean = true;
    allowStakingPower: boolean = true;
    myFaceDirection: number = 1;
    myIndex: number = 1;

    private _myMoveDirection: number = 0;
    public get myMoveDirection(): number {
        return this._myMoveDirection;
    }
    public set myMoveDirection(value: number) {
        let isValueChanged = this.myMoveDirection != value;
        this._myMoveDirection = value;
        if (isValueChanged) {
            if (value == 0) this.requestStopMove();
            else this.requestStartMove(value);
        }
    }

    protected onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    start() {
        // Instantiate Colyseus Client
        // connects into (ws|wss)://hostname[:port]
        this.client = new Colyseus.Client(`${this.useSSL ? 'wss' : 'ws'}://${this.hostname}${([443, 80].includes(this.port) || this.useSSL) ? '' : `:${this.port}`}`);

        // Connect into the room
        this.connect();
    }

    protected update(dt: number): void {
        if (this.isStakingPower) {
            this.powerRatio += dt * this.speedStakePower;
            this.powerRatio = Math.min(1, this.powerRatio);
            this.pbPowerRatio.progress = this.powerRatio;
        }
        else {
            this.pbPowerRatio.progress = 0;
        }
    }

    async connect() {
        try {
            this.panelEnd.active = false;
            this.room = await this.client.joinOrCreate(this.gameRoom);

            console.log('joined successfully!');
            console.log('user sessionId:', this.room.sessionId);

            this.room.state.players.onAdd(this.addNewPlayer.bind(this));
            this.room.state.listen('phase', (value) => {
                if (value == GamePhase.INGAME) {
                    this.panelEnd.active = false;
                    this.room.state.listen('secondsLeft', this.updateLabelCountdown.bind(this));
                    this.room.state.listen('currTurn', this.updateEnterTurn.bind(this));
                }
                else if (value == GamePhase.ENDED) {
                    this.panelEnd.active = true;
                    let winnerSessionId = this.room.state.winner;
                    this.labelEnd.string = winnerSessionId == this.room.sessionId ? "YOU WIN" : "YOU LOSE";
                }
                else if (value == GamePhase.DRAW) {
                    this.panelEnd.active = true;
                    this.labelEnd.string = "GAME DRAW";
                }
            });
            this.room.onStateChange(this.onStateChange.bind(this));

            this.room.onLeave((code) => {
                console.log('onLeave:', code);
            });

        } catch (e) {
            console.error(e);
        }
    }

    onStateChange(state: any) {
        let projectileState = state.projectile;
        if (!projectileState) {
            this.projectile.active = false;
        }
        else {
            this.projectile.active = true;
            this.projectile.setPosition(projectileState.x, projectileState.y, 0);
        }
    }

    onKeyDown(e: EventKeyboard) {
        if (e.keyCode == KeyCode.KEY_A || e.keyCode == KeyCode.ARROW_LEFT) {
            if (this.myMoveDirection == 1) this.myMoveDirection = 0;
            else this.myMoveDirection = -1;
        }
        else if (e.keyCode == KeyCode.KEY_D || e.keyCode == KeyCode.ARROW_RIGHT) {
            if (this.myMoveDirection == -1) this.myMoveDirection = 0;
            else this.myMoveDirection = 1;
        }
        else if (e.keyCode == KeyCode.SPACE) {
            this.isStakingPower = true;
            this.allowStakingPower = false;
        }
    }

    onKeyUp(e: EventKeyboard) {
        if (e.keyCode == KeyCode.KEY_A || e.keyCode == KeyCode.ARROW_LEFT) {
            if (this.myMoveDirection == -1) this.myMoveDirection = 0;
        }
        else if (e.keyCode == KeyCode.KEY_D || e.keyCode == KeyCode.ARROW_RIGHT) {
            if (this.myMoveDirection == 1) this.myMoveDirection = 0;
        }
        else if (e.keyCode == KeyCode.SPACE) {
            if (this.isStakingPower) {
                let angle = this.myFaceDirection * 60;
                this.requestFire(angle, this.powerRatio);
                this.powerRatio = 0;
                this.allowStakingPower = false;
                this.isStakingPower = false;
            }
        }
    }

    requestStartMove(direction: number) {
        this.room?.send('start-move', {
            direction: direction
        });
    }

    requestStopMove() {
        this.room?.send('stop-move');
    }

    requestFire(angle: number, powerRatio: number) {
        this.room?.send('fire', {
            angle: angle,
            powerRatio: powerRatio,
        });
    }

    addNewPlayer(player, index) {
        if (player.sessionId == this.room.sessionId) {
            this.myIndex = index;
        }

        this.appearAxie(index);
        this.updateAxieView(index, player.isMoving, player.faceDirection);

        player.listen('isMoving', () => {
            this.updateAxieView(index, player.isMoving, player.faceDirection);
        });

        player.listen('faceDirection', () => {
            this.updateAxieView(index, player.isMoving, player.faceDirection);
        });

        player.listen('x', () => {
            this.updateAxiePosition(index, player.x);
        });
    }

    appearAxie(index: number) {
        let axie = this.axieSpines[index];
        axie.node.active = true;
    }

    updateAxieView(index: number, isMoving: boolean, faceDirection: number) {
        if (index == this.myIndex) {
            this.myFaceDirection = faceDirection;
        }
        let axie = this.axieSpines[index];

        if (isMoving) axie.setAnimation(0, 'action/run', true);
        else axie.setAnimation(0, 'action/idle/normal', true);

        axie.node.setScale(-faceDirection * 0.1, 0.1, 0.1);
    }

    updateAxiePosition(index: number, x: number) {
        let axie = this.axieSpines[index];
        axie.node.setPosition(x, 0, 0);
        if (index == this.myIndex) {
            this.meIndicator.setPosition(x, 0, 0);
        }
    }

    updateLabelCountdown() {
        let seconds = Math.max(0, Math.ceil(this.room.state.secondsLeft));
        this.labelCountdown.string = seconds.toString();
    }

    updateEnterTurn(newValue, prevValue) {
        if (newValue != prevValue) {
            this.allowStakingPower = true;
            this.isStakingPower = false;
        }

        let currTurn = this.room.state.currTurn;
        let myTurn = this.room.state.players.findIndex(p => p.sessionId == this.room.sessionId);
        this.labelCurrTurn.string = currTurn == myTurn ? "Your turn" : "Opponent turn";
    }
}
