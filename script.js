const video = document.getElementById('video');
const label = document.getElementById('label');

const animalSounds = [
  { name: 'Cow', file: 'sounds/moo.mp3' },
  { name: 'Duck', file: 'sounds/duck.mp3' },
  { name: 'Lion', file: 'sounds/lion.mp3' },
  { name: 'Elephant', file: 'sounds/elephant.mp3' },
  { name: 'Cat', file: 'sounds/cat.mp3' },
  { name: 'Tiger', file: 'sounds/tiger.mp3' },
  { name: 'Yamate Kudasai', file: 'sounds/yamate kudasai.mp3' },
  { name: 'Aahh', file: 'sounds/aahh.mp3' },
  { name: 'Among Us', file: 'sounds/among us.mp3' },
  { name: 'Among Us Drip', file: 'sounds/among us drip.mp3' },
  { name: 'Rooster', file: 'sounds/rooster.mp3' }
];

const faceSoundMap = []; // { samples: [], avgDescriptor: [], soundIndex, lastPlayTime }
const usedSounds = new Set();
const faceCooldown = 5000; // ms per face
let isPlaying = false;
let soundQueue = [];
let currentAudio = null;
let lastFaceDetectedTime = 0;

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('./models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('./models');
  startVideo();
}

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => video.srcObject = stream)
    .catch(err => console.error("Camera error:", err));
}

function euclideanDistance(desc1, desc2) {
  return Math.sqrt(desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0));
}

function findBestMatch(descriptor) {
  let bestMatch = null;
  let bestDistance = Infinity;

  faceSoundMap.forEach(faceEntry => {
    const dist = euclideanDistance(faceEntry.avgDescriptor, descriptor);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = faceEntry;
    }
  });

  return (bestDistance < 0.32) ? bestMatch : null; // tighter threshold
}

function updateAverageDescriptor(faceEntry, newDescriptor) {
  const n = faceEntry.samples.length;
  faceEntry.avgDescriptor = faceEntry.avgDescriptor.map((val, i) =>
    (val * n + newDescriptor[i]) / (n + 1)
  );
  faceEntry.samples.push(newDescriptor);
}

function getUnusedSoundIndex() {
  const available = animalSounds.map((_, i) => i).filter(i => !usedSounds.has(i));
  if (available.length === 0) {
    usedSounds.clear(); // reset if all used
    return Math.floor(Math.random() * animalSounds.length);
  }
  return available[Math.floor(Math.random() * available.length)];
}

function queueSound(soundData) {
  soundQueue.push(soundData);
  if (!isPlaying) {
    playNextSound();
  }
}

function playNextSound() {
  if (soundQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const soundData = soundQueue.shift();
  label.innerText = `${soundData.name} 🐾`;
  currentAudio = new Audio(soundData.file);
  currentAudio.onended = playNextSound;
  currentAudio.play();
}

function stopCurrentSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    isPlaying = false;
    soundQueue = [];
    label.innerText = "Waiting for face...";
  }
}

video.addEventListener('play', () => {
  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })
    ).withFaceLandmarks().withFaceDescriptors();

    if (!detections.length) {
      if (Date.now() - lastFaceDetectedTime > 500) {
        stopCurrentSound();
      }
      return;
    }

    lastFaceDetectedTime = Date.now();

    detections.forEach(detection => {
      const descriptor = Array.from(detection.descriptor);
      let match = findBestMatch(descriptor);

      if (match) {
        updateAverageDescriptor(match, descriptor);
      } else {
        const newSoundIndex = getUnusedSoundIndex();
        usedSounds.add(newSoundIndex);
        match = {
          samples: [descriptor],
          avgDescriptor: descriptor.slice(),
          soundIndex: newSoundIndex,
          lastPlayTime: 0
        };
        faceSoundMap.push(match);
      }

      if (Date.now() - match.lastPlayTime > faceCooldown) {
        match.lastPlayTime = Date.now();
        queueSound(animalSounds[match.soundIndex]);
      }
    });
  }, 500);
});

loadModels();
