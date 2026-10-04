import Phaser from 'phaser';
import './style.css';
import { WebTrainScene } from './scenes/WebTrainScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#80c942',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  input: {
    activePointers: 3,
  },
  scene: [WebTrainScene],
});

const directionButton = document.querySelector<HTMLButtonElement>('#track-direction');

directionButton?.addEventListener('click', () => {
  const scene = game.scene.getScene('WebTrainScene') as WebTrainScene | undefined;
  if (!scene) return;

  const direction = scene.rotateTrackDirection();
  const label = direction === 'x' ? 'Yön: ↘' : 'Yön: ↗';
  const text = directionButton.querySelector('span:last-child');
  if (text) text.textContent = label;
});
