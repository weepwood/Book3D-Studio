import {defineConfig} from '@playwright/test'
export default defineConfig({
 testDir:'./browser-tests',timeout:150000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800},launchOptions:{...(process.env.BOOK3D_CHROMIUM_EXECUTABLE?{executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE}:{}),args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']},screenshot:'only-on-failure'},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}
})
