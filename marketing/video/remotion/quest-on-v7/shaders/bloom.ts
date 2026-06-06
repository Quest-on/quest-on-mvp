// Bloom shader for HtmlInCanvas.
//
// Single full-frame separable gaussian blur followed by additive composite.
// The cobalt-tinted blur acts as a halo: bright pixels in the source bloom
// outward into the surrounding dark area. No threshold — we add the blurred
// copy on top of the original at intensity * tint, scaled by source luma so
// dark regions don't glow grey.

const vertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Separable gaussian blur. 33-tap dense kernel with continuous gaussian
// weights — no linear-tap optimization (which produced visible banding on
// radial gradients). u_radius = sigma in texels.
const blurFragShader = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
uniform vec2 u_dir;
uniform vec2 u_texel;
uniform float u_radius;
const int TAPS = 16;
void main() {
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  float sigma = max(0.5, u_radius);
  float twoSigSq = 2.0 * sigma * sigma;
  for (int i = -TAPS; i <= TAPS; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / twoSigSq);
    sum += texture(u_image, v_uv + u_dir * u_texel * fi) * w;
    weightSum += w;
  }
  outColor = sum / weightSum;
}
`;

// Composite — additive bloom. Cobalt-tinted halo is added to the original
// scaled by intensity. Bloom alpha contributes to overall alpha so the
// halo extends into the canvas's transparent regions.
const compositeFragShader = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;
uniform sampler2D u_bloom;
uniform float u_intensity;
uniform vec3 u_tint;
void main() {
  vec4 base = texture(u_base, v_uv);
  vec4 bloom = texture(u_bloom, v_uv);
  // Tinted bloom — push neutral highlights toward cobalt for brand-luminous
  // peak. Mix factor 0.6 keeps some neutral so highlights don't go monochrome.
  vec3 tinted = mix(bloom.rgb, bloom.rgb * u_tint, 0.6);
  vec3 outRgb = base.rgb + tinted * u_intensity;
  // Alpha: max of base alpha and bloom alpha * intensity * 1.2 so the halo
  // extends past the SVG into transparent regions but does not exceed full.
  float a = clamp(max(base.a, bloom.a * u_intensity * 1.2), 0.0, 1.0);
  outColor = vec4(outRgb, a);
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader create failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`bloom shader compile error: ${info}`);
  }
  return shader;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("program create failed");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`bloom program link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export type BloomProgram = {
  blurProg: WebGLProgram;
  compositeProg: WebGLProgram;
  vao: WebGLVertexArrayObject;
  srcTex: WebGLTexture;
  fboA: WebGLFramebuffer;
  texA: WebGLTexture;
  fboB: WebGLFramebuffer;
  texB: WebGLTexture;
  width: number;
  height: number;
};

function makeFbo(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture();
  if (!tex) throw new Error("tex create failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("fbo create failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

export function initBloom(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): BloomProgram {
  const blurProg = buildProgram(gl, vertexShader, blurFragShader);
  const compositeProg = buildProgram(gl, vertexShader, compositeFragShader);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error("vao create failed");
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  for (const p of [blurProg, compositeProg]) {
    const aPos = gl.getAttribLocation(p, "a_position");
    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    }
  }
  gl.bindVertexArray(null);

  const srcTex = gl.createTexture();
  if (!srcTex) throw new Error("tex create failed");
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const fboW = Math.max(2, Math.floor(width / 2));
  const fboH = Math.max(2, Math.floor(height / 2));
  const { fbo: fboA, tex: texA } = makeFbo(gl, fboW, fboH);
  const { fbo: fboB, tex: texB } = makeFbo(gl, fboW, fboH);

  return {
    blurProg,
    compositeProg,
    vao,
    srcTex,
    fboA,
    texA,
    fboB,
    texB,
    width: fboW,
    height: fboH,
  };
}

export function paintBloom(
  gl: WebGL2RenderingContext,
  prog: BloomProgram,
  source: Element | ElementImage,
  outWidth: number,
  outHeight: number,
  intensity: number,
  threshold: number,
  tint: [number, number, number],
): void {
  // threshold is unused now (kept in signature for API stability).
  void threshold;

  // Upload source.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, prog.srcTex);
  gl.texElementImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source,
  );

  gl.bindVertexArray(prog.vao);
  gl.disable(gl.BLEND);

  // 4 H+V passes at sigma=4 each — total combined sigma ~8 (half-res),
  // ~16 (output-res). 4 ping-pong iterations fully randomize any kernel
  // resonance patterns and produce a clean radial falloff.
  gl.useProgram(prog.blurProg);
  gl.uniform1i(gl.getUniformLocation(prog.blurProg, "u_image"), 0);
  gl.uniform2f(
    gl.getUniformLocation(prog.blurProg, "u_texel"),
    1.0 / prog.width,
    1.0 / prog.height,
  );
  gl.uniform1f(gl.getUniformLocation(prog.blurProg, "u_radius"), 4.0);

  let readTex = prog.srcTex;
  for (let pass = 0; pass < 4; pass++) {
    // H: read → fboB.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prog.fboB);
    gl.viewport(0, 0, prog.width, prog.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform2f(gl.getUniformLocation(prog.blurProg, "u_dir"), 1.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // V: fboB → fboA.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prog.fboA);
    gl.viewport(0, 0, prog.width, prog.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, prog.texB);
    gl.uniform2f(gl.getUniformLocation(prog.blurProg, "u_dir"), 0.0, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    readTex = prog.texA;
  }

  // Composite to default framebuffer.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, outWidth, outHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog.compositeProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, prog.srcTex);
  gl.uniform1i(gl.getUniformLocation(prog.compositeProg, "u_base"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, prog.texA);
  gl.uniform1i(gl.getUniformLocation(prog.compositeProg, "u_bloom"), 1);
  gl.uniform1f(
    gl.getUniformLocation(prog.compositeProg, "u_intensity"),
    intensity,
  );
  gl.uniform3f(
    gl.getUniformLocation(prog.compositeProg, "u_tint"),
    tint[0],
    tint[1],
    tint[2],
  );
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}
