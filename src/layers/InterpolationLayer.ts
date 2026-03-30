import { Layer, LayerProps, LayerContext, PickingInfo } from '@deck.gl/core';
import { Model, Geometry } from '@luma.gl/engine';

// Custom IDW Interpolation Layer
// Based on Inverse Distance Weighting on the GPU (Fragment Shader)

export interface InterpolationLayerProps extends LayerProps {
  data: any[];
  getWeight?: (d: any) => number;
  getPosition?: (d: any) => [number, number];
  getValue?: (d: any) => number;
  p?: number; // Power parameter for IDW
  colorRange?: [number, number, number][]; // Array of RGB colors
}

const defaultProps = {
  p: 2.0,
  getPosition: (d: any) => d.geometry.coordinates,
  getValue: (d: any) => d.properties.avg_temp,
  colorRange: [
    [0, 0, 255],     // Cold
    [0, 255, 255],   // Cool
    [0, 255, 0],     // Moderate
    [255, 255, 0],   // Warm
    [255, 0, 0]      // Hot
  ]
};

export default class InterpolationLayer extends Layer<InterpolationLayerProps> {
  static layerName = 'InterpolationLayer';
  static defaultProps = defaultProps;

  getShaders() {
    return {
      vs: `
        attribute vec2 positions;
        varying vec2 vTexCoord;
        void main() {
          vTexCoord = positions * 0.5 + 0.5;
          gl_Position = vec4(positions, 0.0, 1.0);
        }
      `,
      fs: `
        precision highp float;
        varying vec2 vTexCoord;
        uniform vec2 uPositions[100];
        uniform float uValues[100];
        uniform int uCount;
        uniform float uP;
        uniform vec3 uColors[5];

        vec3 getColor(float v) {
          // Normalize v based on expected weather range (e.g., -10 to 40)
          float norm = clamp((v + 10.0) / 50.0, 0.0, 1.0);
          float step = 1.0 / 4.0;
          if (norm < step) return mix(uColors[0], uColors[1], norm / step);
          if (norm < 2.0 * step) return mix(uColors[1], uColors[2], (norm - step) / step);
          if (norm < 3.0 * step) return mix(uColors[2], uColors[3], (norm - 2.0 * step) / step);
          return mix(uColors[3], uColors[4], (norm - 3.0 * step) / step);
        }

        void main() {
          float sumWeights = 0.0;
          float sumValues = 0.0;
          bool exact = false;

          for (int i = 0; i < 100; i++) {
            if (i >= uCount) break;
            float d = distance(vTexCoord, uPositions[i]);
            if (d < 0.001) {
              gl_FragColor = vec4(getColor(uValues[i]) / 255.0, 0.6);
              exact = true;
              break;
            }
            float w = 1.0 / pow(d, uP);
            sumWeights += w;
            sumValues += w * uValues[i];
          }

          if (!exact) {
            float val = sumValues / sumWeights;
            gl_FragColor = vec4(getColor(val) / 255.0, 0.6);
          }
        }
      `
    };
  }

  initializeState() {
    const { gl } = this.context;
    const model = this._getModel(gl);
    this.setState({ model });
  }

  updateState({ props, oldProps, changeFlags }: any) {
    if (changeFlags.dataChanged || props.getValue !== oldProps.getValue) {
      this._updateAttributes(props);
    }
  }

  _updateAttributes(props: InterpolationLayerProps) {
    // We pass station data as uniforms for small datasets (< 100 stations)
    // For large datasets, we should use a texture.
    const { data, getPosition, getValue } = props;
    const uPositions = data.map(d => {
      const pos = getPosition!(d);
      // Transform lat/lon to normalized 0-1 coords or project them
      // Simplified: current viewpoint logic needed for real projection
      return [pos[0], pos[1]]; // Placeholder: logic to project into viewport
    });
    const uValues = data.map(d => getValue!(d));
    this.setState({ uPositions, uValues, uCount: data.length });
  }

  draw({ uniforms }: any) {
    const { model, uPositions, uValues, uCount } = this.state;
    const { p, colorRange } = this.props;

    if (model) {
      model.setUniforms({
        ...uniforms,
        uPositions: uPositions.flat(),
        uValues,
        uCount,
        uP: p,
        uColors: colorRange!.flat()
      }).draw();
    }
  }

  _getModel(gl: WebGLRenderingContext) {
    return new Model(gl, {
      ...this.getShaders(),
      geometry: new Geometry({
        drawMode: gl.TRIANGLE_FAN,
        attributes: {
          positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
        }
      })
    });
  }
}
