/** World quarter-turns rotate south→west; Three's positive Y rotates south→east. */
export const objectRotationY=(quarterTurns:number):number=>-quarterTurns*Math.PI/2;
