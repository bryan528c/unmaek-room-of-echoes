interface CopyablePoint {
  x: number;
  y: number;
  copy(source: Readonly<{ x: number; y: number }>): unknown;
}

/**
 * Synchronizes an Arcade Body after its Game Object was deliberately moved
 * during Scene.update(). Arcade Physics has already stepped at that point and
 * will otherwise add the same position delta again during World.postUpdate().
 */
export function synchronizeArcadeBodyAfterGameObjectMove(body: {
  position: Readonly<{ x: number; y: number }>;
  prev: CopyablePoint;
  prevFrame: CopyablePoint;
  // Present at runtime in Phaser 3.90, but omitted from its public Body type.
  autoFrame?: CopyablePoint;
  updateFromGameObject(): unknown;
}): void {
  body.updateFromGameObject();
  body.prev.copy(body.position);
  body.prevFrame.copy(body.position);
  body.autoFrame?.copy(body.position);
}
