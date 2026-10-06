/* Feito por Valdecyr Gabryel Bento

 */
const counterDOM = document.getElementById('counter');
const endDOM = document.getElementById('end');
const endTitle = document.getElementById('endTitle');
const endScore = document.getElementById('endScore');
const startBtn = document.getElementById('start');
const retryBtn = document.getElementById('retry');

const scene = new THREE.Scene();

const distance = 500;
const camera = new THREE.OrthographicCamera( window.innerWidth/-2, window.innerWidth/2, window.innerHeight / 2, window.innerHeight / -2, 0.1, 10000 );

camera.rotation.x = 50*Math.PI/180;
camera.rotation.y = 20*Math.PI/180;
camera.rotation.z = 10*Math.PI/180;

const initialCameraPositionY = -Math.tan(camera.rotation.x)*distance;
const initialCameraPositionX = Math.tan(camera.rotation.y)*Math.sqrt(distance**2 + initialCameraPositionY**2);
camera.position.y = initialCameraPositionY;
camera.position.x = initialCameraPositionX;
camera.position.z = distance;

// --- NOVO CÓDIGO DE ÁUDIO INICIA AQUI ---
const listener = new THREE.AudioListener();
camera.add(listener); // Adiciona o ouvinte à câmera

const soundBackground = new THREE.Audio(listener);
const soundJump = new THREE.Audio(listener);
const soundDeath = new THREE.Audio(listener);

const audioLoader = new THREE.AudioLoader();
let audioContextStarted = false; // Flag para garantir que o áudio só inicie uma vez

function startAudio() {
  if (audioContextStarted) return;
  // ensure AudioContext / fallback synth can run
  try { initAudio(); } catch(e) {}

  // Try to load background via THREE.AudioLoader; on error fallback to synthesized background
  audioLoader.load(
    'sounds/background.mp3',
    function(buffer) {
      try {
        soundBackground.setBuffer(buffer);
        soundBackground.setLoop(true);
        soundBackground.setVolume(0.3);
        // Ensure AudioContext is resumed before playing
        try {
          const ctx = (listener && listener.context) || window._audioCtx;
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().then(() => {
              soundBackground.play();
            }).catch(() => startBackground());
          } else {
            soundBackground.play();
          }
        } catch(e) {
          soundBackground.play();
        }
      } catch(e) {
        // If anything fails, fallback to synth background
        startBackground();
      }
    },
    undefined,
    function() {
      // onError
      startBackground();
    }
  );

  // Try to load movement sound; if fails we still have playStepSound() fallback
  audioLoader.load(
    'sounds/jump.mp3',
    function(buffer) {
      try {
        soundJump.setBuffer(buffer);
        soundJump.setVolume(0.8);
      } catch(e) {
        // ignore - fallback will run on play
      }
    },
    undefined,
    function() {
      // onError - fallback available
    }
  );

  // Death sound
  audioLoader.load(
    'sounds/death.mp3',
    function(buffer) {
      try {
        soundDeath.setBuffer(buffer);
        soundDeath.setVolume(0.9);
      } catch(e) {
        // ignore
      }
    },
    undefined,
    function() {
      // onError - fallback available
    }
  );

  audioContextStarted = true;
}
// --- NOVO CÓDIGO DE ÁUDIO TERMINA AQUI ---

// Helper: resume AudioContext if suspended, returns a Promise
function ensureAudioContextResumed() {
  try {
    const ctx = (listener && listener.context) || window._audioCtx;
    if (ctx && ctx.state === 'suspended') return ctx.resume();
    return Promise.resolve();
  } catch(e) {
    return Promise.resolve();
  }
}

// Helper: play a THREE.Audio buffer (or fallback function) - simple, non-blocking
function playAudioBuffer(sound, fallback) {
  try {
    // Resume audio context immediately if suspended (removes delay)
    const ctx = (listener && listener.context) || window._audioCtx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    if (sound && sound.buffer) {
      try { if (sound.isPlaying) sound.stop(); } catch(e) {}
      sound.play().catch(() => {
        // Fallback se o áudio falhar
        try { if (fallback) fallback(); } catch(e2) {}
      });
    } else if (fallback) {
      fallback();
    }
  } catch(e) {
    try { if (fallback) fallback(); } catch(e2) {}
  }
}

const zoom = 2;

const chickenSize = 15;

const positionWidth = 42;
const columns = 17;
const boardWidth = positionWidth*columns;

const stepTime = 120; // Miliseconds it takes for the chicken to take a step forward, backward, left or right
const MAX_QUEUED_MOVES = 4;

let lanes;
let currentLane;
let currentColumn;

let previousTimestamp;
let startMoving;
let moves;
let stepStartTimestamp;
let isDead = false;
const currentPhase = new URLSearchParams(window.location.search).get('phase') === '2' ? 2 : 1;
const MAX_SCORE = currentPhase === 2 ? 750 : 500;
let isWon = false;
let isStarted = false;
let idleTimestamp = null;
let playerInitials = 'AA';
document.body.classList.toggle('desert-phase', currentPhase === 2);


// Pré-inicializa o AudioContext para evitar delays
try {
  if (!window._audioCtx) {
    window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume imediatamente se estiver suspenso
  if (window._audioCtx.state === 'suspended') {
    window._audioCtx.resume().catch(() => {});
  }
} catch(e) { /* ignore */ }

const initialsInput = document.getElementById('playerInitials');

const carFrontTexture = new Texture(40,80,[{x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture = new Texture(40,80,[{x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110,40,[{x: 10, y: 0, w: 50, h: 30 }, {x: 70, y: 0, w: 30, h: 30 }]);
const carLeftSideTexture = new Texture(110,40,[{x: 10, y: 10, w: 50, h: 30 }, {x: 70, y: 10, w: 30, h: 30 }]);

const truckFrontTexture = new Texture(30,30,[{x: 15, y: 0, w: 10, h: 30 }]);
const truckRightSideTexture = new Texture(25,30,[{x: 0, y: 15, w: 10, h: 10 }]);
const truckLeftSideTexture = new Texture(25,30,[{x: 0, y: 5, w: 10, h: 10 }]);

const generateLanes = () => [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9].map((index) => {
  const lane = new Lane(index);
  lane.mesh.position.y = index*positionWidth*zoom;
  scene.add( lane.mesh );
  return lane;
}).filter((lane) => lane.index >= 0);

const addLane = () => {
  const index = lanes.length;
  const lane = new Lane(index);
  lane.mesh.position.y = index*positionWidth*zoom;
  scene.add(lane.mesh);
  lanes.push(lane);
}

const chicken = new Chicken();
scene.add( chicken );

hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
scene.add(hemiLight)

const initialDirLightPositionX = -100;
const initialDirLightPositionY = -100;
dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(initialDirLightPositionX, initialDirLightPositionY, 200);
dirLight.castShadow = true;
dirLight.target = chicken;
scene.add(dirLight);

// Sombras menores mantêm o visual sem sobrecarregar celulares e notebooks.
const shadowQuality = window.matchMedia('(max-width: 700px)').matches ? 512 : 1024;
dirLight.shadow.mapSize.width = shadowQuality;
dirLight.shadow.mapSize.height = shadowQuality;
var d = 500;
dirLight.shadow.camera.left = - d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = - d;

// var helper = new THREE.CameraHelper( dirLight.shadow.camera );
// var helper = new THREE.CameraHelper( camera );
// scene.add(helper)

backLight = new THREE.DirectionalLight(0x000000, .4);
backLight.position.set(200, 200, 50);
backLight.castShadow = true;
scene.add(backLight)

const laneTypes = ['car', 'truck', 'forest'];
const laneSpeeds = [2, 2.5, 3];
const vechicleColors = currentPhase === 2
  ? [0xc45b35, 0x2f5966, 0xe4a94d, 0x8f3f2f]
  : [0xa52523, 0xbdb638, 0x78b14b];
const threeHeights = [20,45,60];

const initaliseValues = () => {
  lanes = generateLanes()

  currentLane = 0;
  currentColumn = Math.floor(columns/2);

  previousTimestamp = null;

  startMoving = false;
  moves = [];
  stepStartTimestamp;

  chicken.position.x = 0;
  chicken.position.y = 0;

  camera.position.y = initialCameraPositionY;
  camera.position.x = initialCameraPositionX;

  dirLight.position.x = initialDirLightPositionX;
  dirLight.position.y = initialDirLightPositionY;
  // Player state
  isDead = false;
  isWon = false;
}

initaliseValues();

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

function onWindowResize() {
  camera.left = window.innerWidth / -2;
  camera.right = window.innerWidth / 2;
  camera.top = window.innerHeight / 2;
  camera.bottom = window.innerHeight / -2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

function Texture(width, height, rects) {
  const canvas = document.createElement( "canvas" );
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext( "2d" );
  context.fillStyle = "#ffffff";
  context.fillRect( 0, 0, width, height );
  context.fillStyle = "rgba(0,0,0,0.6)";  
  rects.forEach(rect => {
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
  });
  return new THREE.CanvasTexture(canvas);
}

function Wheel() {
  const wheel = new THREE.Mesh( 
    new THREE.BoxBufferGeometry( 12*zoom, 33*zoom, 12*zoom ), 
    new THREE.MeshLambertMaterial( { color: 0x333333, flatShading: true } ) 
  );
  wheel.position.z = 6*zoom;
  return wheel;
}

function Car() {
  const car = new THREE.Group();
  const color = vechicleColors[Math.floor(Math.random() * vechicleColors.length)];
  
  const main = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 60*zoom, 30*zoom, 15*zoom ), 
    new THREE.MeshPhongMaterial( { color, flatShading: true } )
  );
  main.position.z = 12*zoom;
  main.castShadow = true;
  main.receiveShadow = true;
  car.add(main)
  
  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 33*zoom, 24*zoom, 12*zoom ), 
    [
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true, map: carBackTexture } ),
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true, map: carFrontTexture } ),
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true, map: carRightSideTexture } ),
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true, map: carLeftSideTexture } ),
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true } ), // top
      new THREE.MeshPhongMaterial( { color: 0xcccccc, flatShading: true } ) // bottom
    ]
  );
  cabin.position.x = 6*zoom;
  cabin.position.z = 25.5*zoom;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  car.add( cabin );
  
  const frontWheel = new Wheel();
  frontWheel.position.x = -18*zoom;
  car.add( frontWheel );

  const backWheel = new Wheel();
  backWheel.position.x = 18*zoom;
  car.add( backWheel );

  car.castShadow = true;
  car.receiveShadow = false;
  
  return car;  
}

function Truck() {
  const truck = new THREE.Group();
  const color = vechicleColors[Math.floor(Math.random() * vechicleColors.length)];


  const base = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 100*zoom, 25*zoom, 5*zoom ), 
    new THREE.MeshLambertMaterial( { color: 0xb4c6fc, flatShading: true } )
  );
  base.position.z = 10*zoom;
  truck.add(base)

  const cargo = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 75*zoom, 35*zoom, 40*zoom ), 
    new THREE.MeshPhongMaterial( { color: 0xb4c6fc, flatShading: true } )
  );
  cargo.position.x = 15*zoom;
  cargo.position.z = 30*zoom;
  cargo.castShadow = true;
  cargo.receiveShadow = true;
  truck.add(cargo)

  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 25*zoom, 30*zoom, 30*zoom ), 
    [
      new THREE.MeshPhongMaterial( { color, flatShading: true } ), // back
      new THREE.MeshPhongMaterial( { color, flatShading: true, map: truckFrontTexture } ),
      new THREE.MeshPhongMaterial( { color, flatShading: true, map: truckRightSideTexture } ),
      new THREE.MeshPhongMaterial( { color, flatShading: true, map: truckLeftSideTexture } ),
      new THREE.MeshPhongMaterial( { color, flatShading: true } ), // top
      new THREE.MeshPhongMaterial( { color, flatShading: true } ) // bottom
    ]
  );
  cabin.position.x = -40*zoom;
  cabin.position.z = 20*zoom;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  truck.add( cabin );

  const frontWheel = new Wheel();
  frontWheel.position.x = -38*zoom;
  truck.add( frontWheel );

  const middleWheel = new Wheel();
  middleWheel.position.x = -10*zoom;
  truck.add( middleWheel );

  const backWheel = new Wheel();
  backWheel.position.x = 30*zoom;
  truck.add( backWheel );

  return truck;  
}

function Three() {
  const three = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 15*zoom, 15*zoom, 20*zoom ), 
    new THREE.MeshPhongMaterial( { color: 0x4d2926, flatShading: true } )
  );
  trunk.position.z = 10*zoom;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  three.add(trunk);

  height = threeHeights[Math.floor(Math.random()*threeHeights.length)];

  const crown = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 30*zoom, 30*zoom, height*zoom ), 
    new THREE.MeshLambertMaterial( { color: currentPhase === 2 ? 0x3f7650 : 0x7aa21d, flatShading: true } )

  );
  crown.position.z = (height/2+20)*zoom;
  crown.castShadow = true;
  crown.receiveShadow = false;
  three.add(crown);

  return three;  
}

function Chicken() {
  const chicken = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry( chickenSize*zoom, chickenSize*zoom, 20*zoom ), 
    new THREE.MeshPhongMaterial( { color: 0xffffff, flatShading: true } )
  );
  body.position.z = 10*zoom;
  body.castShadow = true;
  body.receiveShadow = true;
  chicken.add(body);

  const rowel = new THREE.Mesh(
    new THREE.BoxBufferGeometry( 2*zoom, 4*zoom, 2*zoom ), 
    new THREE.MeshLambertMaterial( { color: 0xF0619A, flatShading: true } )
  );
  rowel.position.z = 21*zoom;
  rowel.castShadow = true;
  rowel.receiveShadow = false;
  chicken.add(rowel);

  return chicken;  
}

function Road() {
  const road = new THREE.Group();

  const createSection = color => new THREE.Mesh(
    new THREE.PlaneBufferGeometry( boardWidth*zoom, positionWidth*zoom ), 
    new THREE.MeshPhongMaterial( { color } )
  );

  const middle = createSection(0x454A59);
  middle.receiveShadow = true;
  road.add(middle);

  const left = createSection(0x393D49);
  left.position.x = - boardWidth*zoom;
  road.add(left);

  const right = createSection(0x393D49);
  right.position.x = boardWidth*zoom;
  road.add(right);

  return road;
}

function Grass() {
  const grass = new THREE.Group();

  const createSection = color => new THREE.Mesh(
    new THREE.BoxBufferGeometry( boardWidth*zoom, positionWidth*zoom, 3*zoom ), 
    new THREE.MeshPhongMaterial( { color } )
  );

  const middle = createSection(currentPhase === 2 ? 0xc58b4a : 0xbaf455);

  middle.receiveShadow = true;
  grass.add(middle);

  const left = createSection(currentPhase === 2 ? 0xb87932 : 0x99C846);

  left.position.x = - boardWidth*zoom;
  grass.add(left);

  const right = createSection(currentPhase === 2 ? 0xa96d3c : 0x99C846);
  right.position.x = boardWidth*zoom;
  grass.add(right);

  grass.position.z = 1.5*zoom;
  return grass;
}

function Lane(index) {
  this.index = index;
  this.type = index <= 0 ? 'field' : laneTypes[Math.floor(Math.random()*laneTypes.length)];

  switch(this.type) {
    case 'field': {
      this.type = 'field';
      this.mesh = new Grass();
      break;
    }
    case 'forest': {
      this.mesh = new Grass();

      this.occupiedPositions = new Set();
      this.threes = [1,2,3,4].map(() => {
        const three = new Three();
        let position;
        do {
          position = Math.floor(Math.random()*columns);
        }while(this.occupiedPositions.has(position))
          this.occupiedPositions.add(position);
        three.position.x = (position*positionWidth+positionWidth/2)*zoom-boardWidth*zoom/2;
        this.mesh.add( three );
        return three;
      })
      break;
    }
    case 'car' : {
      this.mesh = new Road();
      this.direction = Math.random() >= 0.5;

      const occupiedPositions = new Set();
      this.vechicles = [1,2,3].map(() => {
        const vechicle = new Car();
        let position;
        do {
          position = Math.floor(Math.random()*columns/2);
        }while(occupiedPositions.has(position))
          occupiedPositions.add(position);
        vechicle.position.x = (position*positionWidth*2+positionWidth/2)*zoom-boardWidth*zoom/2;
        if(!this.direction) vechicle.rotation.z = Math.PI;
        this.mesh.add( vechicle );
        return vechicle;
      })

      this.speed = laneSpeeds[Math.floor(Math.random()*laneSpeeds.length)];
      break;
    }
    case 'truck' : {
      this.mesh = new Road();
      this.direction = Math.random() >= 0.5;

      const occupiedPositions = new Set();
      this.vechicles = [1,2].map(() => {
        const vechicle = new Truck();
        let position;
        do {
          position = Math.floor(Math.random()*columns/3);
        }while(occupiedPositions.has(position))
          occupiedPositions.add(position);
        vechicle.position.x = (position*positionWidth*3+positionWidth/2)*zoom-boardWidth*zoom/2;
        if(!this.direction) vechicle.rotation.z = Math.PI;
        this.mesh.add( vechicle );
        return vechicle;
      })

      this.speed = laneSpeeds[Math.floor(Math.random()*laneSpeeds.length)];
      break;
    }
  }

// ------------------- Audio helpers -------------------
// Initializes (or resumes) a shared AudioContext and basic nodes.
function initAudio() {
  try {
    if (!window._audioCtx) {
      window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  } catch(e) {
    // AudioContext not available in this environment
  }
}

      }


// Simple background sound: a very low-volume repeating drone (synth) using WebAudio.
function startBackground() {
  try {
    initAudio();
    const ctx = window._audioCtx;
    if (!ctx) return;
    // If already started, do nothing
    if (window._bgSource && window._bgGain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 120; // low drone
    g.gain.value = 0.02; // very quiet background
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    window._bgSource = o;
    window._bgGain = g;
  } catch(e) { /* ignore audio errors */ }
}

function stopBackground() {
  try {
    if (window._bgSource) {
      try { window._bgSource.stop(); } catch(e) {}
      window._bgSource.disconnect && window._bgSource.disconnect();
      window._bgSource = null;
    }
    if (window._bgGain) { window._bgGain.disconnect && window._bgGain.disconnect(); window._bgGain = null; }
  } catch(e) { /* ignore */ }
}

document.querySelector("#retry").addEventListener("click", () => {
  if (lanes && lanes.length) {
    lanes.forEach(l => {
      try { scene.remove(l.mesh); } catch(e) {}
    });
  }
  initaliseValues();
  // show start overlay again
  showStartOverlay();
  try {
    stopBackground();
    if (soundBackground && soundBackground.isPlaying) try { soundBackground.stop(); } catch(e) {}
    if (soundJump && soundJump.isPlaying) try { soundJump.stop(); } catch(e) {}
    if (soundDeath && soundDeath.isPlaying) try { soundDeath.stop(); } catch(e) {}
  } catch(e) {}
});

startBtn && startBtn.addEventListener('click', () => {
  document.body.classList.add('game-running');

  if (initialsInput) {
    // Pega o valor digitado ou usa o placeholder
    let value = initialsInput.value.trim();
    if (!value) {
      value = initialsInput.placeholder;
    }
    playerInitials = sanitizeInitials(value);
    initialsInput.value = playerInitials;
  }
  
  // Validação: iniciais são obrigatórias (não podem ser vazias)
  if (!playerInitials || playerInitials.trim().length === 0) {
    alert('⚠️ Digite suas iniciais para começar!');
    if (initialsInput) {
      initialsInput.focus();
      initialsInput.select();
    }
    document.body.classList.remove('game-running');
    return;
  }
  
  if (playerInitials) {
    savePlayerData(playerInitials, 0);
  }
  // Remove any existing lane meshes to avoid duplicates when restarting/starting
  if (lanes && lanes.length) {
    lanes.forEach(l => {
      try { scene.remove(l.mesh); } catch(e) {}
    });
  }
  initaliseValues();
  resetIdleTimer();
  isStarted = true;
  isDead = false;
  hideOverlay();
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.style.display = 'block';
  counterDOM.innerHTML = currentLane + ' / ' + MAX_SCORE;
  try { startAudio(); startBackground(); } catch(e) {}
});

function showOverlay() {
  if (!endDOM) return;
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.style.display = 'none';
  document.body.classList.remove('game-running');
  endDOM.style.visibility = 'visible';
  endDOM.classList.add('show');
}

function hideOverlay() {
  if (!endDOM) return;
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.style.display = 'none';
  endDOM.classList.remove('show');
  setTimeout(() => {
    if (!endDOM.classList.contains('show')) {
      endDOM.style.visibility = 'hidden';
    }
  }, 260);
}

function showStartOverlay() {
  isStarted = false;
  isDead = false;
  document.body.classList.remove('game-running');
  if (endTitle) endTitle.innerHTML = 'Cross Now';
  if (endScore) endScore.innerHTML = '<span style="font-size: 0.75em; color: #66bb6a; letter-spacing: 0.1em; display: block; margin-top: 8px;">META: ' + MAX_SCORE + ' PONTOS</span>';

  if (initialsInput) {
    initialsInput.style.display = 'inline-block';
    initialsInput.value = ''; // Limpa para novo jogo
    const saved = localStorage.getItem('farmEscapeInitials');
    if (saved) {
      playerInitials = sanitizeInitials(saved);
      initialsInput.placeholder = playerInitials;
    } else {
      initialsInput.placeholder = 'AA';
    }
    // Garante que o input receba o foco quando o overlay aparecer
    setTimeout(() => {
      if (initialsInput && endDOM && endDOM.classList.contains('show')) {
        initialsInput.focus();
        initialsInput.select();
      }
    }, 300);
  }
  if (startBtn) startBtn.style.display = 'inline-block';
  if (retryBtn) retryBtn.style.display = 'none';
  showOverlay();
}

// show start overlay on load
showStartOverlay();

// Initialize audio context on first user interaction to remove audio delay
document.addEventListener('click', () => {
  try {
    const ctx = window._audioCtx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch(e) {}
}, { once: true });

document.addEventListener('keydown', () => {
  try {
    const ctx = window._audioCtx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch(e) {}
}, { once: true });

document.getElementById('forward').addEventListener("click", () => move('forward'));

document.getElementById('backward').addEventListener("click", () => move('backward'));

document.getElementById('left').addEventListener("click", () => move('left'));

document.getElementById('right').addEventListener("click", () => move('right'));

function returnToMenu() {
  // Volta ao menu - para o jogo e mostra overlay inicial
  if (lanes && lanes.length) {
    lanes.forEach(l => {
      try { scene.remove(l.mesh); } catch(e) {}
    });
  }
  initaliseValues();
  showStartOverlay();
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.style.display = 'none';
  try {
    stopBackground();
    if (soundBackground && soundBackground.isPlaying) try { soundBackground.stop(); } catch(e) {}
    if (soundJump && soundJump.isPlaying) try { soundJump.stop(); } catch(e) {}
    if (soundDeath && soundDeath.isPlaying) try { soundDeath.stop(); } catch(e) {}
  } catch(e) {}
}

document.getElementById('menuBtn').addEventListener('click', () => {
  const confirmModal = document.getElementById('confirmModal');
  if (confirmModal) confirmModal.style.display = 'flex';
});

document.getElementById('confirmYes').addEventListener('click', () => {
  const confirmModal = document.getElementById('confirmModal');
  if (confirmModal) confirmModal.style.display = 'none';
  returnToMenu();
});

document.getElementById('confirmNo').addEventListener('click', () => {
  const confirmModal = document.getElementById('confirmModal');
  if (confirmModal) confirmModal.style.display = 'none';
});

window.addEventListener("keydown", event => {
  // ESC para fechar o modal
  if (event.keyCode === 27) {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal && confirmModal.style.display !== 'none') {
      confirmModal.style.display = 'none';
      return;
    }
  }

  const key = event.key.toLowerCase();
  if (['arrowup', 'w'].includes(key)) {
    event.preventDefault();
    move('forward');
  }
  else if (['arrowdown', 's'].includes(key)) {
    event.preventDefault();
    move('backward');
  }
  else if (['arrowleft', 'a'].includes(key)) {
    event.preventDefault();
    move('left');
  }
  else if (['arrowright', 'd'].includes(key)) {
    event.preventDefault();
    move('right');
  }
});

function move(direction) {
  // Block input when dead
  if (isDead) return;
  if (moves.length >= MAX_QUEUED_MOVES) return;
  resetIdleTimer();
  // Play movement sound: prefer loaded buffer, otherwise fallback to beep synth
  try {
    playAudioBuffer(soundJump, playStepBeep);
  } catch(e) {}

  const finalPositions = moves.reduce((position,move) => {
    if(move === 'forward') return {lane: position.lane+1, column: position.column};
    if(move === 'backward') return {lane: position.lane-1, column: position.column};
    if(move === 'left') return {lane: position.lane, column: position.column-1};
    if(move === 'right') return {lane: position.lane, column: position.column+1};
  }, {lane: currentLane, column: currentColumn})

  if (direction === 'forward') {
    if(lanes[finalPositions.lane+1].type === 'forest' && lanes[finalPositions.lane+1].occupiedPositions.has(finalPositions.column)) return;
    if(!stepStartTimestamp) startMoving = true;
    addLane();
  }
  else if (direction === 'backward') {
    if(finalPositions.lane === 0) return;
    if(lanes[finalPositions.lane-1].type === 'forest' && lanes[finalPositions.lane-1].occupiedPositions.has(finalPositions.column)) return;
    if(!stepStartTimestamp) startMoving = true;
  }
  else if (direction === 'left') {
    if(finalPositions.column === 0) return;
    if(lanes[finalPositions.lane].type === 'forest' && lanes[finalPositions.lane].occupiedPositions.has(finalPositions.column-1)) return;
    if(!stepStartTimestamp) startMoving = true;
  }
  else if (direction === 'right') {
    if(finalPositions.column === columns - 1 ) return;
    if(lanes[finalPositions.lane].type === 'forest' && lanes[finalPositions.lane].occupiedPositions.has(finalPositions.column+1)) return;
    if(!stepStartTimestamp) startMoving = true;
  }
  moves.push(direction);
}

// Fallback synth for a short step sound when no file is available
function playStepBeep() {
  try {
    const ctx = window._audioCtx || (new (window.AudioContext || window.webkitAudioContext)());
    if (!ctx) return;
    window._audioCtx = ctx;
    
    // Resume context immediately
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    const now = ctx.currentTime;
    o.frequency.setValueAtTime(900, now);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.08);
  } catch(e) { /* ignore */ }
}

// Fallback synth for death: short descending tone
function playDeathBeep() {
  try {
    const ctx = window._audioCtx || (new (window.AudioContext || window.webkitAudioContext)());
    if (!ctx) return;
    window._audioCtx = ctx;
    
    // Resume context immediately
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    const now = ctx.currentTime;
    o.frequency.setValueAtTime(800, now);
    o.frequency.exponentialRampToValueAtTime(120, now + 0.35);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.3, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.4);
  } catch(e) { /* ignore */ }
}

function sanitizeInitials(text) {
  if (!text) return 'AA';
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, 2).padEnd(2, 'A');
}

function savePlayerData(name, score) {
  try {
    const current = JSON.parse(localStorage.getItem('farmEscapeHighScore') || 'null');
    if (!current || score > current.score) {
      localStorage.setItem('farmEscapeHighScore', JSON.stringify({ name, score }));
    }
    localStorage.setItem('farmEscapeInitials', name);
  } catch (e) {
    // ignore storage errors
  }
}

function getRankings() {
  try {
    return JSON.parse(localStorage.getItem('farmEscapeRankings') || '[]');
  } catch (e) {
    return [];
  }
}

function saveRankEntry(name, score) {
  try {
    const current = getRankings();
    current.push({ name, score, phase: currentPhase, date: new Date().toISOString() });
    current.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    localStorage.setItem('farmEscapeRankings', JSON.stringify(current.slice(0, 10)));
  } catch (e) {
    // ignore storage errors
  }

  fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score, phase: currentPhase })
  }).catch(() => {});
}

function resetIdleTimer() {
  idleTimestamp = performance.now();
}

function handleIdle(timestamp) {
  if (!isStarted || isDead || isWon) return;
  if (startMoving || stepStartTimestamp || moves.length > 0) {
    resetIdleTimer();
    return;
  }
  if (!idleTimestamp) {
    idleTimestamp = timestamp;
    return;
  }
  if (timestamp - idleTimestamp > 3000) {
    move('forward');
    resetIdleTimer();
  }
}

function animate(timestamp) {
  requestAnimationFrame( animate );
  handleIdle(timestamp);

  if(!previousTimestamp) previousTimestamp = timestamp;
  // Limita saltos de tempo após trocar de aba ou sofrer uma queda de frames.
  // Isso evita teletransportes e colisões inconsistentes em aparelhos mais lentos.
  const delta = Math.min(timestamp - previousTimestamp, 34);
  previousTimestamp = timestamp;

  // Animate cars and trucks moving on the lane
  lanes.forEach(lane => {
    if(lane.type === 'car' || lane.type === 'truck') {
      const aBitBeforeTheBeginingOfLane = -boardWidth*zoom/2 - positionWidth*2*zoom;
      const aBitAfterTheEndOFLane = boardWidth*zoom/2 + positionWidth*2*zoom;
      lane.vechicles.forEach(vechicle => {
        // defensive checks
        if (!vechicle || !vechicle.position) return;
        if (typeof vechicle.position.x !== 'number' || !isFinite(vechicle.position.x)) {
          // place vehicle within lane bounds if position is invalid
          vechicle.position.x = Math.random() * (aBitAfterTheEndOFLane - aBitBeforeTheBeginingOfLane) + aBitBeforeTheBeginingOfLane;
        }
        const deltaX = (lane.speed / 16) * delta;
        if (lane.direction) {
          vechicle.position.x -= deltaX;
          if (vechicle.position.x < aBitBeforeTheBeginingOfLane) {
            vechicle.position.x = aBitAfterTheEndOFLane;
          }
        } else {
          vechicle.position.x += deltaX;
          if (vechicle.position.x > aBitAfterTheEndOFLane) {
            vechicle.position.x = aBitBeforeTheBeginingOfLane;
          }
        }
      });
    }
  });

  if(startMoving) {
    stepStartTimestamp = timestamp;
    startMoving = false;
  }

  if(stepStartTimestamp) {
    const moveDeltaTime = timestamp - stepStartTimestamp;
    const moveDeltaDistance = Math.min(moveDeltaTime/stepTime,1)*positionWidth*zoom;
    const jumpDeltaDistance = Math.sin(Math.min(moveDeltaTime/stepTime,1)*Math.PI)*8*zoom;
    switch(moves[0]) {
      case 'forward': {
        const positionY = currentLane*positionWidth*zoom + moveDeltaDistance;
        camera.position.y = initialCameraPositionY + positionY; 
        dirLight.position.y = initialDirLightPositionY + positionY; 
        chicken.position.y = positionY; // initial chicken position is 0

        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case 'backward': {
        positionY = currentLane*positionWidth*zoom - moveDeltaDistance
        camera.position.y = initialCameraPositionY + positionY;
        dirLight.position.y = initialDirLightPositionY + positionY; 
        chicken.position.y = positionY;

        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case 'left': {
        const positionX = (currentColumn*positionWidth+positionWidth/2)*zoom -boardWidth*zoom/2 - moveDeltaDistance;
        // Keep camera centered horizontally; only move the chicken mesh
        chicken.position.x = positionX; // initial chicken position is 0
        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case 'right': {
        const positionX = (currentColumn*positionWidth+positionWidth/2)*zoom -boardWidth*zoom/2 + moveDeltaDistance;
        // Keep camera centered horizontally; only move the chicken mesh
        chicken.position.x = positionX;

        chicken.position.z = jumpDeltaDistance;
        break;
      }
    }
    // Once a step has ended
    if(moveDeltaTime > stepTime) {
      switch(moves[0]) {
        case 'forward': {
            currentLane++;
            counterDOM.innerHTML = currentLane + ' / ' + MAX_SCORE;    
            // Check win condition
            if (!isWon && currentLane >= MAX_SCORE) {
              isWon = true;
              if (initialsInput) {
                playerInitials = sanitizeInitials(initialsInput.value || initialsInput.placeholder);
              }
              savePlayerData(playerInitials, currentLane);
              saveRankEntry(playerInitials, currentLane);
              // show victory overlay but keep the world infinite
              if (endTitle) endTitle.innerHTML = '<span style="color: #66bb6a; font-size: 0.7em; display: block; margin-bottom: 8px; text-shadow: 0 0 10px rgba(102, 187, 106, 0.6);">PARABÉNS</span><span style="background: linear-gradient(135deg, #42a5f5, #66bb6a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">VOCÊ VENCEU</span><span style="font-size: 0.65em; display: block; margin-top: 8px; color: #ffd54f;">Fase ' + currentPhase + ' concluída</span>';
              if (endScore) endScore.innerHTML = '<span style="font-size: 0.95em;">Pontuação: <span style="color: #66bb6a; font-weight: 900;">' + currentLane + '</span> pts</span><span style="display: block; margin-top: 12px; font-size: 0.85em; color: #a6c8ff;">Jogador: ' + playerInitials + '</span><span style="display: block; margin-top: 8px; font-size: 0.75em; color: #42a5f5; letter-spacing: 0.1em;">Desenvolvido por Valdecyr Gabryel Bento</span>';
              if (startBtn) startBtn.style.display = 'none';
              if (retryBtn) retryBtn.style.display = 'inline-block';
              showOverlay();
              // auto-hide after 4 seconds
              setTimeout(() => {
                if (!isDead) hideOverlay();
              }, 4000);
            }
          break;
        }
        case 'backward': {
          currentLane--;
          counterDOM.innerHTML = currentLane + ' / ' + MAX_SCORE;    
          break;
        }
        case 'left': {
          currentColumn--;
          break;
        }
        case 'right': {
          currentColumn++;
          break;
        }
      }
      moves.shift();
      // If more steps are to be taken then restart counter otherwise stop stepping
      stepStartTimestamp = moves.length === 0 ? null : timestamp;
    }
  }

  // Hit test
  if(lanes[currentLane].type === 'car' || lanes[currentLane].type === 'truck') {
    const chickenMinX = chicken.position.x - chickenSize*zoom/2;
    const chickenMaxX = chicken.position.x + chickenSize*zoom/2;
    const vechicleLength = { car: 60, truck: 105}[lanes[currentLane].type]; 
    lanes[currentLane].vechicles.forEach(vechicle => {
      const carMinX = vechicle.position.x - vechicleLength*zoom/2;
      const carMaxX = vechicle.position.x + vechicleLength*zoom/2;
      if(chickenMaxX > carMinX && chickenMinX < carMaxX) {
        // mark dead, show retry and stop further movement
        if (!isDead) {
          isDead = true;
          isStarted = false;
          moves = [];
          stepStartTimestamp = null;
          if (endTitle) endTitle.innerHTML = '<span style="color: #ff6b6b; font-size: 0.7em; display: block; margin-bottom: 8px; text-shadow: 0 0 10px rgba(255, 107, 107, 0.6);">💀 VOCÊ MORREU 💀</span><span style="color: #ff8a8a;">GAME OVER</span>';

          if (endScore) endScore.innerHTML = '<span style="font-size: 0.95em;">Pontuação: <span style="color: #ff8a8a; font-weight: 900;">' + currentLane + '</span> pts</span><span style="display: block; margin-top: 12px; font-size: 0.75em; color: #42a5f5; letter-spacing: 0.1em;">Desenvolvido por Valdecyr Gabryel Bento</span>';
          if (startBtn) startBtn.style.display = 'none';
          if (retryBtn) retryBtn.style.display = 'inline-block';
          showOverlay();
          try {
            playAudioBuffer(soundDeath, playDeathBeep);
          } catch(e) {}
        }
      }
    });

  }
  renderer.render( scene, camera );	
}

requestAnimationFrame( animate );
