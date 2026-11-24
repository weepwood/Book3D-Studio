// Verified observations from the Stripe Press mirror. See docs/stripe-press-parity.md.
export const PRESS_REFERENCE = {
  dragThresholdPx:5, dragRetention:.4, renderFollow:.85,
  snapAcceleration:.008, damping:.32839134, nearDamping:.55,
  nearRange:.3*Math.PI, settleAngle:.005, settleVelocity:.0005,
  multiPageStep:.18, maxDt:.05, fps:60,
  dragLead:.08, dragLeadPx:12, dragTravelDesktop:.73, dragTravelMobile:1.46,
  curl:{amount:7.02,power:.86,foldTiltDeg:31.5,pivotU:.74,pivotV:.5,span:32.4,stretch:0,easeDrag:.14,hoverFrac:.14},
  chainNodes:33, sourcePageWidth:15.6, sourcePageHeight:21.45, portal:{bend:.9,gravityMul:.69,bendFalloff:.393244,groundOpenDeg:7.530629}, stack:{stiffness:18,damping:7,tipFold:1},
  gravityDelayMs:50,gravityDropMs:400
} as const
export function referenceDragProgress(distance:number,width:number,mobile=false){
  const px=Math.abs(distance),r=PRESS_REFERENCE
  return Math.sign(distance)*Math.min(1,r.dragLead*(1-Math.exp(-px/r.dragLeadPx))+(1-r.dragLead)*Math.min(1,px/Math.max(1,width*(mobile?r.dragTravelMobile:r.dragTravelDesktop))))
}
