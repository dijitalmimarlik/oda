/* ==========================================================
   3D SANAL TUR UYGULAMASI
   - Işınlanma (teleport) YOK, serbest yürüme VAR
   - Çarpışma algılama YOK
   - PC (WASD + fare) ve Mobil (dokunma) desteği
   - Arka plan müziği (kullanıcı etkileşimiyle başlar)
   ========================================================== */

// ---------- GENEL DEĞİŞKENLER ----------
let scene, camera, renderer, controls;
let cameraRig; // Kamerayı içinde barındıran ve hareket ettirilen grup
let clock;

// Klavye tuş durumlarını tutan nesne (PC hareketi için)
const tuşlar = {
  ileri: false,
  geri: false,
  sol: false,
  sag: false
};

// Mobilde parmak basılı mı bilgisini tutan bayrak
let mobilHareketAktif = false;

// Hareket hızı (metre/saniye)
const HAREKET_HIZI = 2.0;

// Müzik ile ilgili değişkenler
let sesDinleyici, arkaPlanMuzigi;
let muzikBaslatildiMi = false;

// init() fonksiyonunu try/catch ile çalıştırıyoruz ki bir hata olursa
// sayfa sessizce donmasın, hatayı hem konsola hem ekrana yazsın.
try {
  init();
} catch (hata) {
  console.error("Uygulama başlatılırken hata oluştu:", hata);
  const katman = document.getElementById("baslangicKatmani");
  if (katman) {
    katman.style.display = "flex";
    katman.innerHTML =
      "<h1>Uygulama başlatılamadı</h1><p>" + hata.message +
      "<br><br>Muhtemel sebep: Kütüphaneler yüklenmedi, model/ses dosyası eksik ya da sayfa file:// ile açıldı." +
      "<br>Lütfen F12 ile konsolu kontrol edin.</p>";
  }
}

/* ==========================================================
   SAHNE KURULUMU
   ========================================================== */
function init() {
  // Kütüphanelerin (CDN üzerinden) gerçekten yüklenip yüklenmediğini kontrol et.
  // Yüklenmediyse anlamlı bir hata fırlat (aksi halde "THREE is not defined" gibi
  // belirsiz bir hatayla karşılaşılır ve hiçbir event listener bağlanmaz).
  if (typeof THREE === "undefined") {
    throw new Error("THREE.js yüklenemedi. İnternet bağlantınızı ve CDN erişimini kontrol edin.");
  }
  if (typeof THREE.GLTFLoader === "undefined") {
    throw new Error("THREE.GLTFLoader yüklenemedi (CDN script'i eksik olabilir).");
  }
  if (typeof THREE.OrbitControls === "undefined") {
    throw new Error("THREE.OrbitControls yüklenemedi (CDN script'i eksik olabilir).");
  }

  clock = new THREE.Clock();

  // ---------- SAHNE ----------
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202020);

  // ---------- KAMERA ----------
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // Göz hizası: 1.6 metre (kameranın rig içindeki YEREL yüksekliği)
  camera.position.set(0, 1.6, 0);

  // ---------- KAMERA RIG (HAREKET GRUBU) ----------
  // Hareket ettirdiğimiz şey doğrudan kamera değil, bu grup olacak.
  // Fare ile bakış (OrbitControls) kamerayı yerinde döndürürken,
  // WASD/dokunma hareketi rig'in konumunu değiştirir.
  cameraRig = new THREE.Group();
  cameraRig.position.set(0, 0, 3); // Başlangıç konumu (odanın içine bakacak şekilde ayarlanabilir)
  cameraRig.add(camera);
  scene.add(cameraRig);

  // ---------- IŞIKLANDIRMA ----------
  // Model Blender'da bake edildiği için SADECE zayıf bir ambient light yeterli.
  // Ağır directional/point light EKLEME - dokular zaten ışığı içeriyor.
  const ambientIsik = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientIsik);

  // ---------- RENDERER ----------
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Renklerin doğru (sRGB) görünmesi için gerekli ayar
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  // ---------- FARE İLE BAKIŞ (OrbitControls hilesi) ----------
  // OrbitControls normalde kamerayı bir hedef etrafında DÖNDÜRÜP UZAKLIK ile konumlandırır.
  // Biz mesafeyi (radius) neredeyse sıfıra sabitleyerek bunu "yerinde etrafına bakma" (FPS look)
  // kontrolüne çeviriyoruz. Böylece kamera pozisyonu sabit kalır, sadece yönü değişir.
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, -0.01); // Kameranın hemen önünde sabit bir hedef (yerel koordinat)
  controls.minDistance = 0.01;
  controls.maxDistance = 0.01;
  controls.enablePan = false; // Sağ tık ile kaydırmayı kapat
  controls.enableZoom = false; // Fare tekerleği ile yakınlaşmayı kapat
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.5;

  // ---------- 3D MODELİ YÜKLE (oda.glb) ----------
  const yukleyici = new THREE.GLTFLoader();
  yukleyici.load(
    "oda.glb",
    function (gltf) {
      scene.add(gltf.scene);
    },
    function (xhr) {
      // Yükleme ilerlemesi (isteğe bağlı konsol bilgisi)
      console.log("Model yükleniyor: " + Math.round((xhr.loaded / xhr.total) * 100) + "%");
    },
    function (hata) {
      console.error("oda.glb yüklenirken hata oluştu:", hata);
    }
  );

  // ---------- MÜZİK SİSTEMİ ----------
  sesKurulumu();

  // ---------- KLAVYE OLAYLARI (PC) ----------
  document.addEventListener("keydown", tusaBasildi);
  document.addEventListener("keyup", tusBirakildi);

  // ---------- DOKUNMATİK OLAYLAR (Mobil) ----------
  // Ekrana basılı tutulduğu sürece ileri yürüme
  renderer.domElement.addEventListener("touchstart", dokunmaBasladi, { passive: true });
  renderer.domElement.addEventListener("touchend", dokunmaBitti, { passive: true });
  renderer.domElement.addEventListener("touchcancel", dokunmaBitti, { passive: true });

  // ---------- İLK KULLANICI ETKİLEŞİMİ (müzik + başlangıç katmanını kaldırma) ----------
  const baslangicKatmani = document.getElementById("baslangicKatmani");
  baslangicKatmani.addEventListener("click", ilkEtkilesim);
  baslangicKatmani.addEventListener("touchstart", ilkEtkilesim, { passive: true });

  // ---------- PENCERE BOYUTU DEĞİŞİRSE ----------
  window.addEventListener("resize", pencereBoyutuDegisti);

  // ---------- ANİMASYON DÖNGÜSÜ ----------
  // setAnimationLoop kullanılıyor (requestAnimationFrame yerine); ileride tekrar
  // VR eklenmek istenirse bu yapı zaten uyumludur.
  renderer.setAnimationLoop(animasyonDongusu);
}

/* ==========================================================
   MÜZİK KURULUMU
   ========================================================== */
function sesKurulumu() {
  // AudioListener'ı kameraya ekliyoruz ki 3D sese göre konumlansın (burada basit arka plan müziği kullanıyoruz)
  sesDinleyici = new THREE.AudioListener();
  camera.add(sesDinleyici);

  arkaPlanMuzigi = new THREE.Audio(sesDinleyici);

  const sesYukleyici = new THREE.AudioLoader();
  sesYukleyici.load("muzik.mp3", function (buffer) {
    arkaPlanMuzigi.setBuffer(buffer);
    arkaPlanMuzigi.setLoop(true); // Müzik döngü halinde çalsın
    arkaPlanMuzigi.setVolume(0.3); // Ses biraz kısık olsun
  });
}

// Tarayıcı autoplay politikası gereği müzik ancak kullanıcı etkileşiminden sonra başlayabilir
function ilkEtkilesim() {
  // Başlangıç katmanını gizle (varsa)
  const baslangicKatmani = document.getElementById("baslangicKatmani");
  if (baslangicKatmani) {
    baslangicKatmani.style.display = "none";
  }

  if (!muzikBaslatildiMi && arkaPlanMuzigi && arkaPlanMuzigi.buffer && !arkaPlanMuzigi.isPlaying) {
    arkaPlanMuzigi.play();
    muzikBaslatildiMi = true;
  }
}

/* ==========================================================
   KLAVYE OLAY FONKSİYONLARI (PC hareketi)
   ========================================================== */
function tusaBasildi(olay) {
  switch (olay.code) {
    case "KeyW":
    case "ArrowUp":
      tuşlar.ileri = true;
      break;
    case "KeyS":
    case "ArrowDown":
      tuşlar.geri = true;
      break;
    case "KeyA":
    case "ArrowLeft":
      tuşlar.sol = true;
      break;
    case "KeyD":
    case "ArrowRight":
      tuşlar.sag = true;
      break;
  }
}

function tusBirakildi(olay) {
  switch (olay.code) {
    case "KeyW":
    case "ArrowUp":
      tuşlar.ileri = false;
      break;
    case "KeyS":
    case "ArrowDown":
      tuşlar.geri = false;
      break;
    case "KeyA":
    case "ArrowLeft":
      tuşlar.sol = false;
      break;
    case "KeyD":
    case "ArrowRight":
      tuşlar.sag = false;
      break;
  }
}

/* ==========================================================
   DOKUNMATİK OLAY FONKSİYONLARI (Mobil hareketi)
   ========================================================== */
function dokunmaBasladi() {
  mobilHareketAktif = true;
}

function dokunmaBitti() {
  mobilHareketAktif = false;
}

/* ==========================================================
   PENCERE YENİDEN BOYUTLANDIRMA
   ========================================================== */
function pencereBoyutuDegisti() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ==========================================================
   YARDIMCI FONKSİYON: cameraRig'i belirtilen yönde hareket ettir
   ileriMiktar: kameranın baktığı yönde ilerleme miktarı (+ ileri, - geri)
   yanMiktar: kameraya göre sağa/sola kayma miktarı (+ sağ, - sol)
   ========================================================== */
function rigiHareketEttir(ileriMiktar, yanMiktar) {
  // Kameranın dünya üzerindeki bakış yönünü al
  const bakisYonu = new THREE.Vector3();
  camera.getWorldDirection(bakisYonu);
  bakisYonu.y = 0; // Yerde yürüme: dikey bileşeni sıfırla
  bakisYonu.normalize();

  // Sağ vektör (bakış yönüne dik, yatay düzlemde)
  const sagYonu = new THREE.Vector3();
  sagYonu.crossVectors(bakisYonu, new THREE.Vector3(0, 1, 0)).normalize();

  // Rig konumunu güncelle
  cameraRig.position.addScaledVector(bakisYonu, ileriMiktar);
  cameraRig.position.addScaledVector(sagYonu, yanMiktar);
}

/* ==========================================================
   ANA ANİMASYON DÖNGÜSÜ
   ========================================================== */
function animasyonDongusu() {
  const deltaZaman = clock.getDelta();

  let ileriMiktar = 0;
  let yanMiktar = 0;

  // ---------- PC HAREKETİ (WASD / Yön tuşları) ----------
  if (tuşlar.ileri) ileriMiktar += HAREKET_HIZI * deltaZaman;
  if (tuşlar.geri) ileriMiktar -= HAREKET_HIZI * deltaZaman;
  if (tuşlar.sag) yanMiktar += HAREKET_HIZI * deltaZaman;
  if (tuşlar.sol) yanMiktar -= HAREKET_HIZI * deltaZaman;

  // ---------- MOBİL HAREKETİ (Basılı tutma = ileri yürüme) ----------
  if (mobilHareketAktif) {
    ileriMiktar += HAREKET_HIZI * deltaZaman;
  }

  if (ileriMiktar !== 0 || yanMiktar !== 0) {
    rigiHareketEttir(ileriMiktar, yanMiktar);
  }

  // Fare ile bakış kontrolünü güncelle
  controls.update();

  renderer.render(scene, camera);
}
