import { angleAt } from './geom.js';

// MediaPipe BlazePose 33-landmark topology, in index order.
export const LANDMARK_NAMES = [
  'nose',
  'leftEyeInner', 'leftEye', 'leftEyeOuter',
  'rightEyeInner', 'rightEye', 'rightEyeOuter',
  'leftEar', 'rightEar',
  'mouthLeft', 'mouthRight',
  'leftShoulder', 'rightShoulder',
  'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist',
  'leftPinky', 'rightPinky',
  'leftIndex', 'rightIndex',
  'leftThumb', 'rightThumb',
  'leftHip', 'rightHip',
  'leftKnee', 'rightKnee',
  'leftAnkle', 'rightAnkle',
  'leftHeel', 'rightHeel',
  'leftFootIndex', 'rightFootIndex',
];

/** Minimum landmark visibility to treat a joint as reliably tracked. */
export const VIS = 0.4;

export const isVisible = (joints, name) => !!joints[name] && joints[name].v >= VIS;

/** Hinge joints and the three landmarks that define each angle. */
export const HINGES = {
  leftElbow: ['leftShoulder', 'leftElbow', 'leftWrist'],
  rightElbow: ['rightShoulder', 'rightElbow', 'rightWrist'],
  leftKnee: ['leftHip', 'leftKnee', 'leftAnkle'],
  rightKnee: ['rightHip', 'rightKnee', 'rightAnkle'],
};

/**
 * Elbow and knee angles in degrees (180 = fully straight) for the joints that are visible.
 * Handy for games: e.g. a squat is both knees < 110°.
 */
export function jointAngles(joints) {
  const out = {};
  for (const [name, [a, b, c]] of Object.entries(HINGES)) {
    if (isVisible(joints, a) && isVisible(joints, b) && isVisible(joints, c)) {
      out[name] = angleAt(joints[a], joints[b], joints[c]);
    }
  }
  return out;
}
