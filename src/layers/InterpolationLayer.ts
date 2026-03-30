import { Layer, LayerProps, project32, picking, UpdateParameters, DefaultProps } from '@deck.gl/core';
import { Model, Geometry } from '@luma.gl/engine';

/**
 * Custom IDW Interpolation Layer for Deck.gl v9
 */

export interface InterpolationLayerProps extends LayerProps {
  data: any[];
  getPosition?: (d: any) => [number, number];
  getValue?: (d: any) => number;
  p?: number;
  colorRange?: [number, number, number][];
}

interface InterpolationLayerState {
  model?: Model;
  uPositions: number[];
  uValues: number[];
  uCount: number;
}

const defaultProps: DefaultProps<InterpolationLayerProps> = {
  p: 2.0,
  getPosition: { type: 'accessor', value: (d: any) => d.geometry.coordinates },
  getValue: { type: 'accessor', value: (d: any) => d.properties.avg_temp },
  colorRange: [
    [0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]
  ]
};

export default class InterpolationLayer extends Layer<InterpolationLayerProps> {
  static layerName = 'InterpolationLayer';
  static defaultProps = defaultProps;

  // Use declare to avoid overwriting the base property in Deck.gl v9
  declare state: any;

  getShaders() {
    return {
      vs: `#version 300 es
        in vec2 positions;
        out vec2 vTexCoord;
        void main() {
          vTexCoord = positions * 0.5 + 0.5;
          gl_Position = vec4(positions, 0.0, 1.0);
        }
      `,
      fs: `#version 300 es
        precision highp float;
        in vec2 vTexCoord;
        uniform vec2 uPositions[100];
        uniform float uValues[100];
        uniform int int_uCount;
        uniform float float_uP;
        uniform vec3 vec3_uColors[5];
        out vec4 fragColor;

        vec3 getColor(float v) {
          float norm = clamp((v + 10.0) / 50.0, 0.0, 1.0);
          if (norm < 0.25) return mix(vec3_uColors[0], vec3_uColors[1], norm / 0.25);
          if (norm < 0.5) return mix(vec3_uColors[1], vec3_uColors[2], (norm - 0.25) / 0.25);
          if (norm < 0.75) return mix(vec3_uColors[2], vec3_uColors[3], (norm - 0.5) / 0.25);
          return mix(vec3_uColors[3], vec3_uColors[4], (norm - 0.75) / 0.25);
        }

        void main() {
          if (int_uCount == 0) discard;
          float sumWeights = 0.0;
          float sumValues = 0.0;
          bool exact = false;
          for (int i = 0; i < 100; i++) {
            if (i >= int_uCount) break;
            float d = distance(vTexCoord, uPositions[i]);
            if (d < 0.005) {
              fragColor = vec4(getColor(uValues[i]) / 255.0, 0.7);
              exact = true;
              break;
            }
            float w = 1.0 / pow(max(d, 0.0001), float_uP);
            sumWeights += w;
            sumValues += w * uValues[i];
          }
          if (!exact) {
            float val = sumValues / max(sumWeights, 0.0001);
            fragColor = vec4(getColor(val) / 255.0, 0.6);
          }
        }
      `,
      modules: [project32, picking]
    };
  }

  initializeState() {
    const { device } = (this as any).context;
    this.setState({
      model: this._getModel(device),
      uPositions: [],
      uValues: [],
      uCount: 0
    });
  }

  updateState(params: any) {
    const { props, changeFlags } = params;
    if (changeFlags.dataChanged || changeFlags.viewportChanged) {
      const { data, getPosition, getValue } = props;
      const { viewport } = (this as any).context;
      if (!data || data.length === 0 || !viewport) return;

      const uPositions: number[] = [];
      const uValues: number[] = [];
      
      data.slice(0, 100).forEach((d: any) => {
        const coords = getPosition!(d);
        const [x, y] = viewport.project(coords);
        uPositions.push(x / viewport.width, 1.0 - (y / viewport.height));
        uValues.push(getValue!(d));
      });

      this.setState({
        uPositions,
        uValues,
        uCount: uValues.length
      });
    }
  }

  draw({ uniforms }: any) {
    const { model, uPositions, uValues, uCount } = this.state;
    const { p, colorRange } = (this as any).props;

    if (model && uCount > 0) {
      // In luma.gl v9, setProps is used on the model
      const shaderInputs = (model as any).shaderInputs;
      if (shaderInputs) {
        shaderInputs.setProps({
          ...uniforms,
          uPositions,
          uValues,
          int_uCount: uCount,
          float_uP: p!,
          vec3_uColors: colorRange!.flat()
        });
      } else {
        // Fallback for types that might still use setUniforms
        (model as any).setUniforms({
          ...uniforms,
          uPositions,
          uValues,
          int_uCount: uCount,
          float_uP: p!,
          vec3_uColors: colorRange!.flat()
        });
      }
      model.draw((this as any).context.renderPass);
    }
  }

  _getModel(device: any) {
    return new Model(device, {
      id: `interpolation-model-${(this as any).id}`,
      ...this.getShaders(),
      bufferLayout: [
        { name: 'positions', format: 'float32x2' }
      ],
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
