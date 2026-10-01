const fs = require('fs');
const path = require('path');

const BASE = 'https://demos.littleworkshop.fr/demos/infinitown/';
const OUT = path.join(__dirname, '..', 'assets');
const REFERER = BASE;

const TEXTURE_PATHS = [
  'scenes/main.json',
  'scenes/data/main.bin',
  'environments/envProbe/irradiance.json',
  'main/Maps/AO/block10_merged_mat_ao.jpg',
  'main/Maps/AO/block11_merged_mat_ao.jpg',
  'main/Maps/AO/block1_ao.jpg',
  'main/Maps/AO/block2_ao.jpg',
  'main/Maps/AO/block3_merged_mat_ao.jpg',
  'main/Maps/AO/block4_merged_mat_ao.jpg',
  'main/Maps/AO/block5_merged_mat_ao.jpg',
  'main/Maps/AO/block6_merged_mat_ao.jpg',
  'main/Maps/AO/block7_merged_mat_ao.jpg',
  'main/Maps/AO/block8_merged_mat_ao.jpg',
  'main/Maps/AO/block9_merged_mat_ao.jpg',
  'main/Maps/AO/park2_merged_mat_ao.jpg',
  'main/Maps/AO/park_3_ao.jpg',
  'main/Maps/Textures/Props_Props_01.jpg',
  'main/Maps/Textures/Road.jpg',
  'main/Maps/Textures/Vehicle_Ambulance.jpg',
  'main/Maps/Textures/Vehicle_Bus_1.jpg',
  'main/Maps/Textures/Vehicle_Bus_2.jpg',
  'main/Maps/Textures/Vehicle_Bus_3.jpg',
  'main/Maps/Textures/Vehicle_Car_1.jpg',
  'main/Maps/Textures/Vehicle_Car_2.jpg',
  'main/Maps/Textures/Vehicle_Car_3.jpg',
  'main/Maps/Textures/Vehicle_Container_1.jpg',
  'main/Maps/Textures/Vehicle_Container_2.jpg',
  'main/Maps/Textures/Vehicle_Container_3.jpg',
  'main/Maps/Textures/Vehicle_Pick up Truck_1.jpg',
  'main/Maps/Textures/Vehicle_Pick up Truck_2.jpg',
  'main/Maps/Textures/Vehicle_Pick up Truck_3.jpg',
  'main/Maps/Textures/Vehicle_Police Car.jpg',
  'main/Maps/Textures/Vehicle_SUV_1.jpg',
  'main/Maps/Textures/Vehicle_SUV_2.jpg',
  'main/Maps/Textures/Vehicle_SUV_3.jpg',
  'main/Maps/Textures/Vehicle_Taxi.jpg',
  'main/Maps/Textures/Vehicle_Truck_1.jpg',
  'main/Maps/Textures/Vehicle_Truck_2.jpg',
  'main/Maps/Textures/Vehicle_Truck_3.jpg',
  'main/Materials/merged/block10_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block11_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block1_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block2_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block3_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block4_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block5_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block6_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block7_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block8_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/block9_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/intersection_03_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/park2_merged-mat-_MainTex-atlas0.jpg',
  'main/Materials/merged/park_merged-mat-_MainTex-atlas0.jpg',
];

async function download(relativePath) {
  const url = BASE + 'assets/' + relativePath.split('/').map(encodeURIComponent).join('/').replace(/%2F/g, '/');
  const target = path.join(OUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    console.log('skip', relativePath);
    return;
  }
  const res = await fetch(url, {
    headers: {
      Referer: REFERER,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed ${relativePath}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(target, buf);
  console.log('saved', relativePath, buf.length);
}

(async () => {
  for (const p of TEXTURE_PATHS) {
    await download(p);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
