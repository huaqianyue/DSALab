import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './build/icon',
    name: 'DSALab',
    executableName: 'DSALAb',
    appBundleId: 'com.huaqianyue.dsalab',
    appCategoryType: 'public.app-category.education',
    protocols: [{
      name: 'DSALAb',
      schemes: ['dsalab']
    }]
  },
  rebuildConfig: {},
  makers: [
    // macOS DMG Installer
    new MakerDMG({
      name: 'DSALab',
      icon: './build/icon.icns',
      format: 'ULFO'
    }),
    // macOS ZIP (for direct download)
    new MakerZIP({}, ['darwin']),
    
    // Windows Installer
    new MakerSquirrel({
      name: 'DSALab',
      setupIcon: './build/icon.ico',
      setupExe: 'DSALab-Setup-${version}.exe'
    }),
    
    // Linux DEB (Debian/Ubuntu)
    new MakerDeb({
      options: {
        name: 'dsalab',
        productName: 'DSALab',
        genericName: 'C++ Playground',
        description: 'DSALab - C++ Playground for Data Structures and Algorithms',
        categories: ['Development', 'Education'],
        icon: './build/icon.png',
        section: 'devel',
        priority: 'optional',
        maintainer: 'Wang Xingyu <WMX_0121@outlook.com>',
        homepage: 'https://github.com/huaqianyue/DSALab',
        bin: 'DSALab'
      }
    }),
    
    // Linux RPM (RedHat/Fedora/SUSE)
    new MakerRpm({
      options: {
        name: 'dsalab',
        productName: 'DSALab',
        description: 'DSALab - C++ Playground for Data Structures and Algorithms',
        categories: ['Development'],
        icon: './build/icon.png',
        license: 'MIT',
        homepage: 'https://github.com/huaqianyue/DSALab',
        bin: 'DSALab'
      }
    })
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
