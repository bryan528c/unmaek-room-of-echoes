import Phaser from 'phaser';
import './styles.css';
import { gameConfig } from './game/config';
import { initializeServices } from './game/services';

const overlay = document.querySelector<HTMLElement>('#overlay');
if (!overlay) throw new Error('Overlay root not found');

const services = initializeServices(overlay);
const game = new Phaser.Game(gameConfig);

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('pointerdown', () => services.audio.unlock(), { once: true });
window.addEventListener('keydown', () => services.audio.unlock(), { once: true });
window.addEventListener('beforeunload', () => { services.persist(); game.destroy(true); });
