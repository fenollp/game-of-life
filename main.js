function GameOfLife (canvas) {
    function resize() {
        var closest_pow2 = function (x) {
            return Math.pow(2, Math.ceil(Math.log(x)/Math.log(2)));
        };
        var w = closest_pow2(window.innerWidth);
        var h = closest_pow2(window.innerHeight);
        console.log(w);
        console.log(h);
        canvas.width = w;
        canvas.height = h;
    };
    canvas.addEventListener('resize', resize, false);
    resize();

    /* Private stuff */
    var gl;
    var pendingLive = [];

    var scale = 1.0;

    var requestFrame = function() {
        return window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            function(callback) {
                setTimeout(callback, 40);
            };
    }();

    var getFPS = function() {
        var thenTime = Date.now() / 1000;
        var frameHistory = [];
        var frameIndex = 0;
        var totalFrameTime= 0;
        var frameNumber = 60;
        return function() {
            var nowTime = Date.now() / 1000;
            var elapsed = nowTime - thenTime;
            thenTime = nowTime;
            totalFrameTime += elapsed - (frameHistory[frameIndex] || 0);
            frameHistory[frameIndex] = elapsed;
            frameIndex = (frameIndex + 1) % frameNumber;
            var averageElasped = totalFrameTime / frameNumber;
            return 1 / averageElasped;
        };
    }();

    function captureClick(canvas) {
        function relMouseCoords(currentElement, event){
            var totalOffsetX = 0;
            var totalOffsetY = 0;
            var canvasX = 0;
            var canvasY = 0;

            do {
                totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
                totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
            } while (currentElement = currentElement.offsetParent)

            canvasX = event.pageX - totalOffsetX;
            canvasY = event.pageY - totalOffsetY;

            return {x:canvasX, y:canvasY}
        }

        var holding = false;
        var scaling = false;
        canvas.addEventListener('mousedown', function(e) {
            holding = true;
            pos = relMouseCoords(this, e);
            pendingLive.push(pos);
        });

        canvas.addEventListener('mousemove', function(e) {
            if (!holding) return;
            pos = relMouseCoords(this, e);
            pendingLive.push(pos);
        });
        canvas.addEventListener('mouseup', function(e) {
            holding = false;
        });
        canvas.addEventListener('touchmove', function(e) {
            if (!holding) return;
            pos = relMouseCoords(this, e.touches[0]);
            pendingLive.push(pos);
        }, false);
        canvas.ontouchstart = function(e) {
            if (e.touches.length == 2)
                scaling = true;
            else
                holding = true;
            return false;
        }
        canvas.ontouchend = function(e) {
            holding = false;
        }
        canvas.addEventListener('gesturechange', function(e) {
            if (!scaling) return;
            if (e.scale > 1.0)
                scale = scale * 1.03;
            else if (e.scale < 1.0)
                scale = scale / 1.03;
            scale = scale < 1.0 ? 1.0 : scale;
            scale = scale > 10 ? 10 : scale;
        }, false);
        canvas.addEventListener('gestureend', function(e) {
            scaling = false;
        }, false);
    }

    function captureMouseWheel(canvas) {
        canvas.onmousewheel = function(e) {
            if (e.wheelDelta > 0.0)
                scale *= 1.03;
            else
                scale /= 1.03;
            scale = scale < 1.0 ? 1.0 : scale;
            scale = scale > 10 ? 10 : scale;
        };
    }

    var createProgram = function() {
        var getShader = function(src, type) {
            shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                alert("Can't compile shader: " + gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        }
        return function(vshader, fshader) {
            var program = gl.createProgram();
            vshader = getShader(vshader, gl.VERTEX_SHADER);
            fshader = getShader(fshader, gl.FRAGMENT_SHADER);
            if (!vshader || !fshader) return null;

            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                alert("Unable to initialize the shader program.");
                return null;
            }
            return program;
        };
    }();

    function Texture(w, h, data) {
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (!data) data = null;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h,
                      0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.resize = resize;
    }

    /* Public methods */
    this.width = canvas.width;
    this.height = canvas.height;
    this.resize = resize;
    this.zoom = function(pos, ratio) {};
    this.run = function() {
        captureClick(canvas);
        captureMouseWheel(canvas);
        mainLoop.call(this);
    }

    var VSHADER = [ "#version 100",
                    "attribute vec4 vertice_position;",
                    "uniform float cell_width;",
                    "uniform float cell_height;",
                    "uniform mat4 transform;",
                    "varying float w, h;",
                    "varying vec2 xy;",
                    "varying vec2 neighbors[8];",
                    "void main() {",
                    "    gl_Position = transform * vertice_position;",
                    "    xy = (vertice_position.xy + vec2(1.0, 1.0)) * 0.5;",
                    "    neighbors[0] = vec2(cell_width, cell_height);",
                    "    neighbors[1] = vec2(-cell_width, -cell_height);",
                    "    neighbors[2] = vec2(cell_width, -cell_height);",
                    "    neighbors[3] = vec2(-cell_width, cell_height);",
                    "    neighbors[4] = vec2(0, cell_height);",
                    "    neighbors[5] = vec2(cell_width, 0);",
                    "    neighbors[6] = vec2(0, -cell_height);",
                    "    neighbors[7] = vec2(-cell_width, 0);",
                    "    w = cell_width;",
                    "    h = cell_height;",
                    "}"
                  ].join('\n');

    var STEPSHADER = [ "#version 100",
                       "precision mediump float;",
                       "uniform sampler2D tex;",
                       "uniform vec2 revive;",
                       "varying float w, h;",
                       "varying vec2 xy;",
                       "varying vec2 neighbors[8];",
                       "void main () {",
                       "    int count = 0;",
                       "    for (int i = 0; i <= 7; i++) {",
                       "        if (texture2D(tex, xy + neighbors[i]).g == 1.0)",
                       "            count += 1;",
                       "    }",
                       "    float g = texture2D(tex, xy).g;",
                       "    if (count == 3 || (g == 1.0 && count == 2) ||",
                       "        (abs(xy.x - revive.x) < w * 5.0 &&",
                       "         abs(xy.y - revive.y) < h * 5.0))",
                       "        gl_FragColor = vec4(0.1, 1, 0.2, 1);",
                       "    else if (g > 0.0)",
                       "        gl_FragColor = vec4(0.1, g - 0.05, 0.2, 1);",
                       "    else",
                       "        gl_FragColor = vec4(0.1, 0.0, 0.2, 1);",
                       "}"
                     ].join('\n');

    var SHOWSHADER = [ "#version 100",
                       "uniform sampler2D tex;",
                       "precision mediump float;",
                       "varying vec2 xy;",
                       "void main() {",
                       "    gl_FragColor = texture2D(tex, xy);",
                       "}"
                     ].join('\n');

    /* Main logic */
    try {
        gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    } catch(e) {}
    if (!gl) return;
    var calcProgram = createProgram(VSHADER, STEPSHADER);
    var displayProgram = createProgram(VSHADER, SHOWSHADER);

    var initData = new Uint8Array(canvas.width * canvas.height * 4);
    for (var i = 0; i < initData.length; i += 4) {
        initData[i+1] = Math.random() > 0.5 ? 255 : 0;
        initData[i+3] = 255;
    }
    var sourceTexture = new Texture(canvas.width, canvas.height, initData);
    var outputTexture = new Texture(canvas.width, canvas.height);

    /* Prepare initial data */
    var vertices = [ 1.0,  1.0,
                     -1.0, 1.0,
                     1.0,  -1.0,
                     -1.0, -1.0
                   ];
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,
                  new Float32Array(vertices), gl.STATIC_DRAW);
    verticesPosition = gl.getAttribLocation(displayProgram,
                                            'vertice_position');
    gl.enableVertexAttribArray(verticesPosition);
    gl.vertexAttribPointer(verticesPosition, 2,
                           gl.FLOAT, false, 0, 0);

    var frameBuffer = gl.createFramebuffer();
    var cellWidthLocation = gl.getUniformLocation(calcProgram, "cell_width");
    var cellHeightLocation = gl.getUniformLocation(calcProgram, "cell_height");
    var reviveLocation = gl.getUniformLocation(calcProgram, "revive");
    var transformLocation = gl.getUniformLocation(calcProgram, "transform");
    var transformLocationInDisplay = gl.getUniformLocation(displayProgram, "transform");
    gl.activeTexture(gl.TEXTURE0);

    var mainLoop = function() {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // Calculation program: render-to-texture
        gl.useProgram(calcProgram);
        gl.uniform1f(cellWidthLocation, 1.0 / canvas.width);
        gl.uniform1f(cellHeightLocation, 1.0 / canvas.height);
        gl.uniformMatrix4fv(transformLocation, gl.FALSE, mat4.create());

        var revive = [-1, -1];
        if (pendingLive.length > 0) {
            pos = pendingLive.shift();
            revive = vec2.fromValues(pos.x / canvas.width, 1 - pos.y / canvas.height);
            vec2.scale(revive, revive, 2);
            vec2.add(revive, revive, vec2.fromValues(-1.0, -1.0));
            vec2.scale(revive, revive, 1 / scale);
            vec2.add(revive, revive, vec2.fromValues(1.0, 1.0));
            vec2.scale(revive, revive, 1 / 2);
        }
        gl.uniform2f(reviveLocation, revive[0], revive[1]);

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                gl.TEXTURE_2D, outputTexture.texture, 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.useProgram(null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                gl.TEXTURE_2D, null, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Display program: render to screen
        gl.useProgram(displayProgram);
        gl.viewport(0, 0, canvas.width, canvas.height);

        transform = mat4.create();
        transform[0] = scale;
        transform[5] = scale;
        gl.uniformMatrix4fv(transformLocationInDisplay, gl.FALSE, transform);

        gl.bindTexture(gl.TEXTURE_2D, outputTexture.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);

        document.title = getFPS().toFixed(0) + ' FPS';

        // Pint-pong texture
        tmp = outputTexture;
        outputTexture = sourceTexture;
        sourceTexture = tmp;
        var that = this;
        //return;
        requestFrame(function() {
            mainLoop.call(that);
        });
    }
}
