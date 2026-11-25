export type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> };

// Compiles and links a shader pair, with each uniform's location by name (arrays without their [0]).
export function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string, defines = ''): Program {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, `#version 300 es\n${defines}${source}`);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile');
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Program failed to link');
  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(program, i)!.name;
    uniforms[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, name)!;
  }
  return { program, uniforms };
}

// A vertex array reading `buffer` as interleaved floats, one [attribute, size] per entry of `layout`.
export function vertexArray(gl: WebGL2RenderingContext, program: WebGLProgram, buffer: WebGLBuffer, layout: [string, number][]) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = layout.reduce((sum, [, size]) => sum + size, 0) * 4;
  let offset = 0;
  for (const [name, size] of layout) {
    const at = gl.getAttribLocation(program, name);
    if (at >= 0) {
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride, offset);
    }
    offset += size * 4;
  }
  gl.bindVertexArray(null);
  return vao;
}

type DensityTarget = { framebuffer: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number };

// A half-float framebuffer to gather density in, remade whenever the canvas changes size. Gives null when the
// browser cannot render to float textures or the framebuffer is incomplete.
export function densityTargets(gl: WebGL2RenderingContext): (width: number, height: number) => DensityTarget | null {
  if (!gl.getExtension('EXT_color_buffer_float')) return () => null;
  let target: DensityTarget | null = null;
  return (width, height) => {
    if (target && target.width === width && target.height === height) return target;
    if (target) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const [key, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_2D, key!, value!);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    target = complete ? { framebuffer, texture, width, height } : null;
    return target;
  };
}
