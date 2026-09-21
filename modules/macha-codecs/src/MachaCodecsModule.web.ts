import { registerWebModule, NativeModule } from 'expo';

// MachaCodecsModule is not available on the web platform.
class MachaCodecsModule extends NativeModule<{}> {}

export default registerWebModule(MachaCodecsModule, 'MachaCodecsModule');
