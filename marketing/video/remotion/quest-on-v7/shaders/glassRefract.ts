// Liquid glass refraction shader for HtmlInCanvas.
//
// Samples the underlying HTML rendering as a WebGL2 texture and applies a
// radial refraction warp centered on the canvas. Pixels near edges bend
// inward (real-glass cube interior), with a subtle iridescent hue shift
// driven by screen-space angle. Used in Cut 9 to elevate the
// "blackbox → glassbox" reveal beyond CSS gradients.

export const glassRefractVertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const glassRefractFragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform float u_strength;
uniform float u_iridescent;
uniform vec2 u_resolution;

vec3 hueShift(vec3 color, float h) {
  const vec3 k = vec3(0.57735, 0.57735, 0.57735);
  float ch = cos(h);
  return color * ch + cross(k, color) * sin(h) + k * dot(k, color) * (1.0 - ch);
}

void main() {
  vec2 center = vec2(0.5, 0.5);
  vec2 d = v_uv - center;
  float r = length(d);
  // Stronger displacement near the edges (r near 0.6+); calmer in the center.
  // Pinch slightly, like real glass refraction at a curved interface.
  float bend = smoothstep(0.05, 0.55, r) * u_strength;
  vec2 refractUv = v_uv - normalize(d + 1e-5) * bend * 0.06;

  // Chromatic split — channels offset slightly along the bend axis for
  // iridescence at peak strength.
  vec2 dir = normalize(d + 1e-5);
  float ca = u_iridescent * 0.012;
  float rC = texture(u_image, refractUv + dir * ca).r;
  float gC = texture(u_image, refractUv).g;
  float bC = texture(u_image, refractUv - dir * ca).b;
  float aC = texture(u_image, refractUv).a;
  vec3 col = vec3(rC, gC, bC);

  // Subtle hue shift across the surface based on angle.
  float ang = atan(d.y, d.x);
  col = hueShift(col, ang * 0.08 * u_iridescent);

  // Edge fresnel — brighten the rim slightly for crystal feel.
  float rim = smoothstep(0.45, 0.6, r);
  col += vec3(0.34, 0.55, 0.95) * rim * 0.18 * u_iridescent;

  outColor = vec4(col, aC);
}
`;

export type GlassRefractProgram = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  texture: WebGLTexture;
  uStrength: WebGLUniformLocation | null;
  uIridescent: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uImage: WebGLUniformLocation | null;
};

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
    throw new Error(`shader compile error: ${info}`);
  }
  return shader;
}

export function initGlassRefract(
  gl: WebGL2RenderingContext,
): GlassRefractProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, glassRefractVertexShader);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, glassRefractFragmentShader);
  const program = gl.createProgram();
  if (!program) throw new Error("program create failed");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`program link error: ${info}`);
  }

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
  const aPos = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const texture = gl.createTexture();
  if (!texture) throw new Error("texture create failed");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    program,
    vao,
    texture,
    uStrength: gl.getUniformLocation(program, "u_strength"),
    uIridescent: gl.getUniformLocation(program, "u_iridescent"),
    uResolution: gl.getUniformLocation(program, "u_resolution"),
    uImage: gl.getUniformLocation(program, "u_image"),
  };
}

export function paintGlassRefract(
  gl: WebGL2RenderingContext,
  prog: GlassRefractProgram,
  source: Element | ElementImage,
  width: number,
  height: number,
  strength: number,
  iridescent: number,
): void {
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, prog.texture);
  // Upload the HTML element / captured ElementImage as the source texture.
  gl.texElementImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source,
  );
  if (prog.uImage) gl.uniform1i(prog.uImage, 0);
  if (prog.uStrength) gl.uniform1f(prog.uStrength, strength);
  if (prog.uIridescent) gl.uniform1f(prog.uIridescent, iridescent);
  if (prog.uResolution) gl.uniform2f(prog.uResolution, width, height);

  gl.bindVertexArray(prog.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}
