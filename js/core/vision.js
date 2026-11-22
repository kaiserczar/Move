// Loads MediaPipe vision tasks (run fully in the browser via WASM/WebGL).

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models';

export const POSE_MODELS = {
  lite: `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  full: `${MODEL_BASE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  heavy: `${MODEL_BASE}/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
};
const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
// Landscape variant: 256x144 input, matches 16:9 webcams.
const SEGMENT_MODEL = `${MODEL_BASE}/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite`;

let visionPromise = null;
let filesetPromise = null;

async function loadVision() {
  visionPromise ??= import(`${CDN}/vision_bundle.mjs`);
  const vision = await visionPromise;
  filesetPromise ??= vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  return { vision, fileset: await filesetPromise };
}

async function createWithFallback(Task, fileset, options) {
  try {
    return await Task.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    console.warn(`${Task.name}: GPU delegate unavailable, falling back to CPU.`, err);
    return Task.createFromOptions(fileset, options('CPU'));
  }
}

/**
 * PoseLandmarker in VIDEO mode.
 * Call `detector.detectForVideo(videoEl, performance.now())` once per new video frame.
 */
export async function createPoseDetector(model = 'lite', numPoses = 4) {
  const { vision, fileset } = await loadVision();
  return createWithFallback(vision.PoseLandmarker, fileset, (delegate) => ({
    baseOptions: { modelAssetPath: POSE_MODELS[model] ?? POSE_MODELS.lite, delegate },
    runningMode: 'VIDEO',
    numPoses,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  }));
}

/**
 * HandLandmarker in IMAGE mode: it is run on small upscaled crops around each wrist
 * (see hands.js), so each call is an independent image.
 */
export async function createHandDetector() {
  const { vision, fileset } = await loadVision();
  return createWithFallback(vision.HandLandmarker, fileset, (delegate) => ({
    baseOptions: { modelAssetPath: HAND_MODEL, delegate },
    runningMode: 'IMAGE',
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
  }));
}

/**
 * ImageSegmenter (selfie model) in VIDEO mode: one low-res "is this pixel a person" confidence
 * mask covering everyone in frame. Used for the background-removal view.
 */
export async function createPersonSegmenter() {
  const { vision, fileset } = await loadVision();
  return createWithFallback(vision.ImageSegmenter, fileset, (delegate) => ({
    baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate },
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  }));
}
