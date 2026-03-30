import { Layer, LayerProps, project32, picking } from '@deck.gl/core';
import { Model, Geometry } from '@luma.gl/engine';

// Custom IDW Interpolation Layer for Deck.gl v9
// Uses a full-screen quad and Inverse Distance Weighting in the Fragment Shader

export interface InterpolationLayerProps extends LayerProps {
  data: any[];
  getPosition?: (d: any) => [number, number];
  getValue?: (d: any) => number;
  p?: number; // Power parameter for IDW
  colorRange?: [number, number, number][]; // Array of RGB colors
}

interface InterpolationLayerState {
  model?: any;
  uPositions: number[];
  uValues: number[];
  uCount: number;
}

const defaultProps = {
  p: 2.0,
  getPosition: { type: 'accessor', value: (d: any) => d.geometry.coordinates },
  getValue: { type: 'accessor', value: (d: any) => d.properties.avg_temp },
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

  // Special handling for state in Deck.gl v9 / TS
  get typedState() {
    return this.state as unknown as InterpolationLayerState;
  }

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
        uniform int int_uCount;
        uniform float float_uP;
        uniform vec3 vec3_uColors[5];

        vec3 getColor(float v) {
          float norm = clamp((v + 10.0) / 50.0, 0.0, 1.0);
          if (norm < 0.25) return mix(vec3_uColors[0], vec3_uColors[1], norm / 0.25);
          if (norm < 0.5) return mix(vec3_uColors[1], vec3_uColors[2], (norm - 0.25) / 0.25);
          if (norm < 0.75) return mix(vec3_uColors[2], vec3_uColors[3], (norm - 0.5) / 0.25);
          return mix(vec3_uColors[3], vec3_uColors[4], (norm - 0.75) / 0.25);
        }

        void main() {
          if (int_uCount == 0) {
            discard;
          }
          
          float sumWeights = 0.0;
          float sumValues = 0.0;
          bool exact = false;

          for (int i = 0; i < 100; i++) {
            if (i >= int_uCount) break;
            
            float d = distance(vTexCoord, uPositions[i]);
            if (d < 0.005) {
              gl_FragColor = vec4(getColor(uValues[i]) / 255.0, 0.7);
              exact = true;
              break;
            }
            float w = 1.0 / pow(max(d, 0.0001), float_uP);
            sumWeights += w;
            sumValues += w * uValues[i];
          }

          if (!exact) {
            float val = sumValues / max(sumWeights, 0.0001);
            gl_FragColor = vec4(getColor(val) / 255.0, 0.6);
          }
        }
      `,
      modules: [project32, picking]
    };
  }

  initializeState() {
    const { device } = this.context as any;
    const model = this._getModel(device);
    this.setState({ 
      model,
      uPositions: [],
      uValues: [],
      uCount: 0
    });
  }

  updateState({ props, changeFlags }: any) {
    if (changeFlags.dataChanged || changeFlags.viewportChanged) {
      const { data, getPosition, getValue } = props;
      const { viewport } = this.context as any;
      
      if (!data || data.length === 0 || !viewport) return;

      const uPositions = data.map((d: any) => {
        const [lng, lat] = getPosition(d);
        const [x, y] = viewport.project([lng, lat]);
        return [x / viewport.width, 1.0 - (y / viewport.height)];
      }).slice(0, 100);

      const uValues = data.map((d: any) => getValue(d)).slice(0, 100);
      
      this.setState({ 
        uPositions: uPositions.flat(), 
        uValues, 
        uCount: uPositions.length 
      });
    }
  }

  draw({ uniforms }: any) {
    const { model, uPositions, uValues, uCount } = this.typedState;
    const { p, colorRange } = this.props;
    const { viewport } = this.context as any;

    if (model && uCount > 0) {
      model.setUniforms({
        ...uniforms,
        uPositions,
        uValues,
        int_uCount: uCount,
        float_uP: p,
        vec3_uColors: colorRange!.flat().map((c: number) => c),
        uViewport: [0, 0, viewport.width, viewport.height]
      });
      model.draw(this.context.renderPass);
    }
  }

  _getModel(device: any) {
    return new Model(device, {
      id: `interpolation-model-${this.id}`,
      ...this.getShaders(),
      geometry: new Geometry({
        topology: 'triangle-strip',
        attributes: {
          positions: {
            value: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            size: 2
          }
        }
      })
    });
  }
}
