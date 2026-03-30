import { Layer, LayerProps, LayerContext, PickingInfo, project32, picking } from '@deck.gl/core';
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
        uniform vec4 uViewport; // [x, y, width, height]

        vec3 getColor(float v) {
          float norm = clamp((v + 10.0) / 50.0, 0.0, 1.0);
          float stepValue = 1.0 / 4.0;
          if (norm < stepValue) return mix(uColors[0], uColors[1], norm / stepValue);
          if (norm < 2.0 * stepValue) return mix(uColors[1], uColors[2], (norm - stepValue) / stepValue);
          if (norm < 3.0 * stepValue) return mix(uColors[2], uColors[3], (norm - 2.0 * stepValue) / stepValue);
          return mix(uColors[3], uColors[4], (norm - 3.0 * stepValue) / stepValue);
        }

        void main() {
          if (uCount == 0) {
            discard;
          }
          
          float sumWeights = 0.0;
          float sumValues = 0.0;
          bool exact = false;

          for (int i = 0; i < 100; i++) {
            if (i >= uCount) break;
            
            // Positions are passed in screen-normalized coordinates (0 to 1)
            float d = distance(vTexCoord, uPositions[i]);
            if (d < 0.005) {
              gl_FragColor = vec4(getColor(uValues[i]) / 255.0, 0.7);
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
      `,
      modules: [project32, picking]
    };
  }

  initializeState() {
    const { device } = this.context;
    const model = this._getModel(device);
    this.setState({ model });
  }

  updateState({ props, changeFlags }: any) {
    if (changeFlags.dataChanged || changeFlags.viewportChanged) {
      this._updateAttributes(props);
    }
  }

  _updateAttributes(props: InterpolationLayerProps) {
    const { data, getPosition, getValue } = props;
    const { viewport } = this.context;
    
    if (!data || data.length === 0 || !viewport) return;

    // Convert longitude/latitude to normalized screen coordinates (0 to 1)
    const uPositions = data.map(d => {
      const [lng, lat] = getPosition!(d);
      const [x, y] = viewport.project([lng, lat]);
      return [x / viewport.width, 1.0 - (y / viewport.height)];
    }).slice(0, 100);

    const uValues = data.map(d => getValue!(d)).slice(0, 100);
    this.setState({ 
      uPositions: uPositions.flat(), 
      uValues, 
      uCount: uPositions.length 
    });
  }

  draw({ uniforms }: any) {
    const { model, uPositions, uValues, uCount } = this.state;
    const { p, colorRange } = this.props;
    const { viewport } = this.context;

    if (model && uCount > 0) {
      model.setUniforms({
        ...uniforms,
        uPositions,
        uValues,
        uCount,
        uP: p,
        uColors: colorRange!.flat(),
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
        topology: 'triangle-fan',
        attributes: {
          positions: {
            value: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            size: 2
          }
        }
      })
    });
  }
}
