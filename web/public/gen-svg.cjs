const fs = require("fs");
const content = fs.readFileSync("modus.svg", "utf8");
const brains = content.match(/<path[^>]+>/g);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
  <style>
    .cls-1{fill:#92d4dc;}
    .cls-2{fill:#fff;}
    .cls-3{fill:#294255;}
    .orbit { stroke: rgba(146, 212, 220, 0.4); stroke-width: 2; fill: none; stroke-dasharray: 4 8; }
    .neuron { fill: #fff; }
  </style>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
  <!-- Orbit Path Template (Elliptical) - Center around 512,512 with varying radii -->
  <path id="orbit-path" d="M 52 512 A 460 175 0 1 1 972 512 A 460 175 0 1 1 52 512" />
  
  <clipPath id="back-clip">
    <rect x="-1000" y="-1000" width="3000" height="1512" />
  </clipPath>
  <clipPath id="front-clip">
    <rect x="-1000" y="512" width="3000" height="2000" />
  </clipPath>
</defs>

<!-- Orbit Paths drawn behind the brain, naturally masked by the brain layer -->
<g class="orbit">
  <use href="#orbit-path" transform="rotate(30 512 512)" />
  <use href="#orbit-path" transform="rotate(90 512 512)" />
  <use href="#orbit-path" transform="rotate(150 512 512)" />
</g>

<!-- EVERYTHING BEHIND THE BRAIN (Top halves, y < 512) -->
<g transform="rotate(30 512 512)" clip-path="url(#back-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="5s" begin="-1.2s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="5s" begin="-1.2s" repeatCount="indefinite" />
    </circle>
</g>
<g transform="rotate(90 512 512)" clip-path="url(#back-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="7s" begin="-3.1s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="7s" begin="-3.1s" repeatCount="indefinite" />
    </circle>
</g>
<g transform="rotate(150 512 512)" clip-path="url(#back-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="6s" begin="-2.4s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="6s" begin="-2.4s" repeatCount="indefinite" />
    </circle>
</g>

<!-- Brain Shapes -->
<g id="brain">
  ${brains.join("\\n  ")}
</g>

<!-- EVERYTHING IN FRONT OF THE BRAIN (Bottom halves, y >= 512) -->
<g transform="rotate(30 512 512)" clip-path="url(#front-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="5s" begin="-1.2s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="5s" begin="-1.2s" repeatCount="indefinite" />
    </circle>
</g>
<g transform="rotate(90 512 512)" clip-path="url(#front-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="7s" begin="-3.1s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="7s" begin="-3.1s" repeatCount="indefinite" />
    </circle>
</g>
<g transform="rotate(150 512 512)" clip-path="url(#front-clip)">
    <circle class="neuron" filter="url(#glow)">
      <animateMotion dur="6s" begin="-2.4s" repeatCount="indefinite">
        <mpath href="#orbit-path"/>
      </animateMotion>
      <animate attributeName="r" values="6; 2; 6; 14; 6" keyTimes="0; 0.25; 0.5; 0.75; 1" dur="6s" begin="-2.4s" repeatCount="indefinite" />
    </circle>
</g>

</svg>`;

fs.writeFileSync("modus2-animated.svg", svg);
console.log("Successfully generated modus2-animated.svg!");
