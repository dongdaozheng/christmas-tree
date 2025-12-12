'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// --- Global State & Configuration ---
type Mode = 'TREE' | 'SCATTER' | 'FOCUS';

interface Particle {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  velocity: THREE.Vector3;
  type: 'DECOR' | 'DUST' | 'PHOTO';
  rotationSpeed?: THREE.Vector3;
  baseScale?: THREE.Vector3;
}

const CONFIG = {
  particleCount: 1500, // Main decor
  dustCount: 2500,
  colors: {
    gold: 0xd4af37,
    green: 0x0f4d19, // Deep green
    red: 0x8a0303,
    white: 0xfceea7, // Cream
  },
};

const STATE = {
  mode: 'TREE' as Mode,
  targetPhotoIndex: -1,
  handRotation: { x: 0, y: 0 },
};

export default function ChristmasExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For CV inference if needed, though HandLandmarker uses video directly
  const [isLoading, setIsLoading] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);

  // References to keep accessible for event handlers
  const sceneRef = useRef<THREE.Scene | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const photoTexturesRef = useRef<THREE.Texture[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- 1. Scene Setup ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.2;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 50);

    // Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // --- 2. Post-Processing ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45, // strength
      0.4,  // radius
      0.7   // threshold
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // --- 3. Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const internalPointLight = new THREE.PointLight(0xffaa00, 2, 20);
    internalPointLight.position.set(0, 5, 0);
    scene.add(internalPointLight);

    const spotLightGold = new THREE.SpotLight(CONFIG.colors.gold, 1200);
    spotLightGold.position.set(30, 40, 40);
    spotLightGold.angle = Math.PI / 4;
    spotLightGold.penumbra = 0.5;
    scene.add(spotLightGold);

    const spotLightBlue = new THREE.SpotLight(0x4444ff, 600);
    spotLightBlue.position.set(-30, 20, -30);
    spotLightBlue.angle = Math.PI / 4;
    spotLightBlue.penumbra = 0.5;
    scene.add(spotLightBlue);

    // --- 4. Asset Generation ---

    // Candy Cane Texture Generator
    const createCandyCaneTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ff0000';
        // Draw diagonal stripes
        for (let i = -64; i < 128; i += 16) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 8, 0);
          ctx.lineTo(i + 8 - 64, 64);
          ctx.lineTo(i - 64, 64);
          ctx.fill();
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const candyCaneTexture = createCandyCaneTexture();

    // Default Photo
    const createDefaultPhoto = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fceea7'; // Cream background
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 60px "Cinzel"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('JOYEUX', 256, 220);
        ctx.fillText('NOEL', 256, 292);
        // Add a border
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 20;
        ctx.strokeRect(10, 10, 492, 492);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    
    // Geometries
    const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const sphereGeo = new THREE.SphereGeometry(0.3, 32, 32);
    
    // Candy Cane Geometry
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.3, 1.2, 0),
      new THREE.Vector3(0.5, 0.9, 0)
    ]);
    const candyGeo = new THREE.TubeGeometry(curve, 20, 0.08, 8, false);

    // Materials
    const goldMat = new THREE.MeshStandardMaterial({ 
      color: CONFIG.colors.gold, 
      roughness: 0.3, 
      metalness: 0.8 
    });
    const greenMat = new THREE.MeshStandardMaterial({ 
      color: CONFIG.colors.green, 
      roughness: 0.6 
    });
    const redPhysMat = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.red,
      roughness: 0.2,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });
    const candyMat = new THREE.MeshStandardMaterial({
      map: candyCaneTexture,
      roughness: 0.4
    });

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // --- 5. Particle System Construction ---
    const particles: Particle[] = [];

    // Helper to add particle
    const addParticle = (mesh: THREE.Mesh, type: 'DECOR' | 'DUST' | 'PHOTO') => {
      const p: Particle = {
        mesh,
        targetPos: new THREE.Vector3(),
        currentPos: new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50),
        velocity: new THREE.Vector3(),
        type,
        rotationSpeed: new THREE.Vector3(Math.random() * 0.02, Math.random() * 0.02, Math.random() * 0.02),
        baseScale: mesh.scale.clone()
      };
      
      mesh.position.copy(p.currentPos);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      
      particles.push(p);
      mainGroup.add(mesh);
    };

    // 1. Photo Particles (Start with one default)
    const photoMat = new THREE.MeshStandardMaterial({ map: createDefaultPhoto() });
    const photoMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), [
      goldMat, goldMat, goldMat, goldMat, photoMat, goldMat // Front is photo
    ]);
    addParticle(photoMesh, 'PHOTO');
    photoTexturesRef.current.push(photoMat.map!);

    // 2. Main Particles
    for (let i = 0; i < CONFIG.particleCount; i++) {
      const type = Math.random();
      let mesh: THREE.Mesh;

      if (type < 0.3) {
        mesh = new THREE.Mesh(boxGeo, Math.random() > 0.5 ? goldMat : greenMat);
      } else if (type < 0.6) {
        mesh = new THREE.Mesh(sphereGeo, Math.random() > 0.5 ? goldMat : redPhysMat);
      } else if (type < 0.7) {
         mesh = new THREE.Mesh(candyGeo, candyMat);
         mesh.scale.set(0.5, 0.5, 0.5);
      } else {
        // More boxes
        mesh = new THREE.Mesh(boxGeo, goldMat);
      }
      addParticle(mesh, 'DECOR');
    }

    // 3. Dust Particles
    // Spec says "2500 dust particles".
    const tinyBox = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < CONFIG.dustCount; i++) {
       const mesh = new THREE.Mesh(tinyBox, new THREE.MeshBasicMaterial({ color: 0xffffff }));
       addParticle(mesh, 'DUST');
    }

    // --- Shuffle Particles for Uniform Distribution ---
    // This ensures ornaments (Decor) and dust are mixed throughout the tree height,
    // rather than having ornaments at the bottom and dust at the top.
    for (let i = particles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [particles[i], particles[j]] = [particles[j], particles[i]];
    }

    particlesRef.current = particles;
    setTimeout(() => setIsLoading(false), 100);

    // --- 6. Animation Loop & State Logic ---
    const clock = new THREE.Clock();

    const animate = () => {
      requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      // const delta = clock.getDelta();

      // Interaction Mapping
      // Target rotation based on hand input
      const targetRotY = STATE.handRotation.x * Math.PI; // X input -> Y rotation
      const targetRotX = STATE.handRotation.y * Math.PI * 0.5; // Y input -> X rotation
      
      mainGroup.rotation.y += (targetRotY - mainGroup.rotation.y) * 0.1;
      mainGroup.rotation.x += (targetRotX - mainGroup.rotation.x) * 0.1;

      // Identify target photo for FOCUS mode
      let targetPhotoP: Particle | null = null;
      if (STATE.mode === 'FOCUS') {
        // If no target selected, select one random PHOTO
        if (STATE.targetPhotoIndex === -1) {
          const photos = particles.filter(p => p.type === 'PHOTO');
          if (photos.length > 0) {
            const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
            STATE.targetPhotoIndex = particles.indexOf(randomPhoto);
          }
        }
        if (STATE.targetPhotoIndex !== -1) {
          targetPhotoP = particles[STATE.targetPhotoIndex];
        }
      } else {
        STATE.targetPhotoIndex = -1;
      }

      // Calculate Target Positions based on Mode
      particles.forEach((p, i) => {
        // const t = i / particles.length;
        
        // --- Mode 1: TREE ---
        if (STATE.mode === 'TREE') {
          // Spiral Cone
          // radius = maxRadius * (1 - normalizedHeight)
          // angle = normalizedHeight * 50 * PI
          // We map 'i' to height roughly
          const h = (i / particles.length); // 0 to 1
          const y = h * 30 - 15; // -15 to 15 height
          const maxRadius = 12;
          const radius = maxRadius * (1 - h) + 0.5; // +0.5 to keep center not empty
          const angle = h * 50 * Math.PI + (time * 0.1); // add slow spin

          p.targetPos.set(
            Math.cos(angle) * radius,
            y,
            Math.sin(angle) * radius
          );
          
          // Reset scale
          if (p.baseScale) p.mesh.scale.lerp(p.baseScale, 0.1);
        }

        // --- Mode 2: SCATTER ---
        else if (STATE.mode === 'SCATTER') {
          // Random Sphere 8-20 radius
          // We only calculate target ONCE ideally, but strictly following "calculate target position" in loop or using noise
          // For stable scatter, we can use a hash of index, or just let them float.
          // Let's use noise-like function based on index and time
          
          // Actually, "Particle must rotate based on random velocity"
          p.mesh.rotation.x += p.rotationSpeed!.x;
          p.mesh.rotation.y += p.rotationSpeed!.y;
          
          // We need stable targets for lerp, or they jitter. 
          // Let's generate a spherical position based on index hash
          const phi = Math.acos( -1 + ( 2 * i ) / particles.length );
          const theta = Math.sqrt( particles.length * Math.PI ) * phi;
          const r = 14 + (Math.sin(i + time * 0.5) * 6); // breathe between 8 and 20 roughly

          p.targetPos.setFromSphericalCoords(r, phi, theta);
          
          if (p.baseScale) p.mesh.scale.lerp(p.baseScale, 0.1);
        }

        // --- Mode 3: FOCUS ---
        else if (STATE.mode === 'FOCUS') {
           if (p === targetPhotoP) {
             // Target Photo to front
             p.targetPos.set(0, 2, 35);
             p.mesh.lookAt(camera.position); // Look at camera
             
             // Scale up 4.5
             p.mesh.scale.lerp(new THREE.Vector3(4.5, 4.5, 4.5), 0.1);
             // We need to override rotation logic so it faces camera perfectly
             // applied via lookAt in render loop or here? 
             // Position update is below, rotation handles itself usually or random.
             // For the target photo, we lock rotation
             p.mesh.rotation.set(0, 0, 0); // Reset random rotation
           } else {
             // Background scatter
             const phi = Math.acos( -1 + ( 2 * i ) / particles.length );
             const theta = Math.sqrt( particles.length * Math.PI ) * phi;
             const r = 30 + Math.sin(i) * 5; // Push back further
             p.targetPos.setFromSphericalCoords(r, phi, theta);
             if (p.baseScale) p.mesh.scale.lerp(p.baseScale, 0.1);
           }
        }

        // Apply Lerp
        p.currentPos.lerp(p.targetPos, 0.05); // Smooth transition
        p.mesh.position.copy(p.currentPos);
      });

      // Render
      composer.render();
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (container) container.innerHTML = '';
      renderer.dispose();
    };
  }, []);

  // --- MediaPipe Integration ---
  useEffect(() => {
    let handLandmarker: HandLandmarker | undefined;
    let animationFrameId: number;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        
        startWebcam();
      } catch (error) {
        console.error("MediaPipe Init Error:", error);
      }
    };

    const startWebcam = () => {
      // 检查浏览器是否支持 mediaDevices
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((stream) => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.addEventListener("loadeddata", predictWebcam);
            }
          })
          .catch((err) => {
            console.warn("Webcam access denied or not available. Falling back to mouse/touch interaction only.", err);
            // 可以在这里设置一个状态，提示用户摄像头不可用，或者静默失败
          });
      } else {
        console.warn("getUserMedia is not supported in this browser environment.");
      }
    };

    const predictWebcam = () => {
      if (videoRef.current && handLandmarker) {
        const startTimeMs = performance.now();
        const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          
          // Keypoints: Thumb(4), Index(8), Wrist(0), Tips(12,16,20)
          const thumb = landmarks[4];
          const index = landmarks[8];
          const wrist = landmarks[0];
          const middle = landmarks[12];
          const ring = landmarks[16];
          const pinky = landmarks[20];

          // 1. Pinch Detection (Thumb - Index distance)
          const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
          if (pinchDist < 0.05) {
            STATE.mode = 'FOCUS';
          }

          // 2. Fist Detection (Avg distance of tips to wrist)
          const tips = [index, middle, ring, pinky];
          let avgDist = 0;
          tips.forEach(tip => {
             avgDist += Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
          });
          avgDist /= 4;

          if (avgDist < 0.25) { // Adjusted per spec logic, though normalized coordinates might vary
            STATE.mode = 'TREE';
          } else if (avgDist > 0.4) {
            STATE.mode = 'SCATTER';
          }

          // 3. Interaction Mapping (Palm Center -> Rotation)
          // Use Landmark 9 (Middle finger MCP) as palm center approximation or just average
          const palm = landmarks[9];
          // Map X (0-1) to Rotation Y (-PI to PI)
          // Map Y (0-1) to Rotation X (-PI/4 to PI/4)
          STATE.handRotation.x = (palm.x - 0.5) * 2; // -1 to 1
          STATE.handRotation.y = (palm.y - 0.5) * 2;
        }

        animationFrameId = requestAnimationFrame(predictWebcam);
      }
    };

    setupMediaPipe();

    return () => {
      if (handLandmarker) handLandmarker.close();
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // --- Photo Upload Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result) return;
      
      new THREE.TextureLoader().load(ev.target.result as string, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        
        // Create new Photo Particle
        const photoMat = new THREE.MeshStandardMaterial({ map: t });
        const goldMat = new THREE.MeshStandardMaterial({ 
          color: CONFIG.colors.gold, 
          roughness: 0.3, 
          metalness: 0.8 
        });
        
        // Exact BoxGeometry Wrapper as requested
        const photoMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), [
          goldMat, goldMat, goldMat, goldMat, photoMat, goldMat
        ]);
        
        if (sceneRef.current) {
            // Need to manually add to our tracking array and scene
            const p: Particle = {
                mesh: photoMesh,
                targetPos: new THREE.Vector3(),
                currentPos: new THREE.Vector3(0, 0, 50), // Start from camera
                velocity: new THREE.Vector3(),
                type: 'PHOTO',
                rotationSpeed: new THREE.Vector3(0,0,0),
                baseScale: new THREE.Vector3(1,1,1)
            };
            
            // Add to scene group
            // We need to find the mainGroup. In this scope we can search or use ref.
            // Using sceneRef to find group or just appending to scene is risky if we want rotation.
            // Better to traverse scene to find group or store group in ref.
            // For safety/speed in this architecture, let's append to the first group in scene
            const group = sceneRef.current.children.find(c => c instanceof THREE.Group);
            if (group) {
                group.add(photoMesh);
                particlesRef.current.push(p);
                
                // Switch to Focus mode to show it off
                STATE.mode = 'FOCUS';
                STATE.targetPhotoIndex = particlesRef.current.indexOf(p);
            }
        }
      });
    };
    reader.readAsDataURL(file);
  };

  // --- Keyboard Handling ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setUiHidden(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <>
      <div ref={containerRef} className="w-full h-full absolute top-0 left-0 overflow-hidden" />
      
      {/* Loader */}
      <div className={`loader-overlay ${!isLoading ? 'ui-hidden' : ''}`}>
        <div className="loader-spinner"></div>
        <div className="text-white font-cinzel text-xl tracking-widest">LOADING HOLIDAY MAGIC</div>
      </div>

      {/* UI Controls */}
      <div className={`transition-opacity duration-1000 ${uiHidden ? 'ui-hidden' : ''} ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="title-text">Merry Christmas</h1>
        
        <div className="upload-wrapper">
          <label className="upload-btn">
            Add Memories
            <input type="file" hidden accept="image/*" onChange={handleFileUpload} />
          </label>
          <div className="hint-text">Press &apos;H&apos; to Hide Controls</div>
        </div>
      </div>

      {/* Webcam (Hidden) */}
      <div className="webcam-container">
        <video ref={videoRef} autoPlay playsInline style={{ width: '160px', height: '120px' }}></video>
        <canvas ref={canvasRef} width="160" height="120"></canvas>
      </div>
    </>
  );
}

