/* ==========================================================
   3D SANAL TUR UYGULAMASI
   - Işınlanma (teleport) YOK, serbest yürüme VAR
   - Çarpışma algılama YOK
   - PC (WASD + fareyi basılı tutup sürükleyerek bakış, Space/Shift ile yükselme-alçalma)
   - Mobil (dokunma) desteği
   - Arka plan müziği (kullanıcı etkileşimiyle başlar)
   ========================================================== */

// ---------- GENEL DEĞİŞKENLER ----------
let scene, camera, renderer;
let cameraRig; // Kamerayı içinde barındıran ve hareket ettirilen grup
let clock;

// Fare ile bakış (tıkla-ve-sürükle) için yatay (yaw) ve dikey (pitch) açılar (radyan)
let yatayAci = 0; // Sağa/sola bakış (Y ekseni etrafında dönüş)
let dikeyAci = 0; // Yukarı/aşağı bakış (X ekseni etrafında dönüş)
const FARE_HASSASIYETI = 0.006; // Fare hareketinin bakışa ne kadar yansıyacağı
const DIKEY_ACI_LIMITI = Math.PI / 2 - 0.05; // Tepe/taban takla atmasını önlemek için sınır
let fareSurukleniyor = false; // Fare tuşu basılı tutuluyor mu?

// Klavye tuş durumlarını tutan nesne (PC hareketi için)
const tuşlar = {
  ileri: false,
  geri: false,
  sol: false,
  sag: false,
  yukselme: false, // Space tuşu - yukarı çık
  alcalma: false // Shift tuşu - aşağı in
};

// Mobilde parmak basılı mı bilgisini tutan bayrak
let mobilHareketAktif = false;

// Hareket hızı (metre/saniye)
const HAREKET_HIZI = 2.0;

// Müzik ile ilgili değişkenler
let sesDinleyici, arkaPlanMuzigi;
let muzikBaslatildiMi = false;
let kullaniciEtkilesimYapildiMi = false; // Kullanıcı en az bir kez tıkladı/dokundu mu?

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
  // Fare ile bakış (Pointer Lock) kamerayı yerinde döndürürken,
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
  renderer.domElement.style.cursor = "grab"; // Fare ile sürüklenebilir olduğunu belirten imleç
  document.body.appendChild(renderer.domElement);

  // ---------- FARE İLE BAKIŞ (Tıkla ve Sürükle) ----------
  // Fare tuşu basılıyken (mousedown) ve hareket ederken (mousemove) bakış açısını
  // güncelliyoruz. Fare tuşu bırakılınca (mouseup) döndürme durur.
  renderer.domElement.addEventListener("mousedown", function () {
    fareSurukleniyor = true;
    renderer.domElement.style.cursor = "grabbing";
  });

  // mouseup'ı window üzerinde dinliyoruz ki kullanıcı fareyi canvas dışında
  // bıraksa bile sürükleme durumu doğru şekilde sıfırlansın
  window.addEventListener("mouseup", function () {
    fareSurukleniyor = false;
    renderer.domElement.style.cursor = "grab";
  });

  document.addEventListener("mousemove", fareHareketiyleBak);

  // ---------- 3D MODELİ YÜKLE (oda.glb) ----------
  const yukleyici = new THREE.GLTFLoader();
  yukleyici.load(
    "oda.glb",
    function (gltf) {
      scene.add(gltf.scene);

      // ---------- KAMERAYI MODELE GÖRE OTOMATİK KONUMLANDIR ----------
      // Blender'dan export edilen model sahne merkezinde (0,0,0) olmayabilir
      // ya da beklenmedik bir ölçekte olabilir (örn. Scale uygulanmamış obje).
      // Bu yüzden modelin gerçek sınırlayıcı kutusunu (bounding box) hesaplayıp
      // hem ölçeği hem konumu buna göre düzeltiyoruz.
      let sinirKutusu = new THREE.Box3().setFromObject(gltf.scene);
      let boyut = sinirKutusu.getSize(new THREE.Vector3());
      let enBuyukBoyut = Math.max(boyut.x, boyut.y, boyut.z);

      // ---- OTOMATİK ÖLÇEK DÜZELTMESİ ----
      // Bir odanın makul boyutu genelde birkaç metredir. Model bundan çok küçük
      // (örn. cm yerine m karışıklığı, Blender'da uygulanmamış Scale) ya da çok
      // büyük çıkarsa, geçici bir çözüm olarak otomatik olarak yeniden ölçekliyoruz.
      // KALICI ÇÖZÜM: Blender'da nesneyi seçip Ctrl+A > Scale (Apply Scale) yapıp
      // tekrar export etmek. Bu kod sadece o adım atlanmışsa geçici bir kurtarma sağlar.
      const HEDEF_BOYUT = 6; // metre - tipik bir oda için varsayılan hedef genişlik
      if (enBuyukBoyut > 0 && (enBuyukBoyut < 0.5 || enBuyukBoyut > 100)) {
        const olcekFaktoru = HEDEF_BOYUT / enBuyukBoyut;
        gltf.scene.scale.multiplyScalar(olcekFaktoru);
        console.warn(
          "UYARI: Model boyutu anormaldi (" + enBuyukBoyut.toFixed(5) + " birim). " +
          "Otomatik olarak " + olcekFaktoru.toFixed(2) + "x ölçeklendirildi. " +
          "Kalıcı çözüm için Blender'da modelin Scale değerini uygulayın (Ctrl+A > Scale) ve tekrar export edin."
        );

        // Ölçeklendirme sonrası sınır kutusunu tekrar hesapla
        sinirKutusu = new THREE.Box3().setFromObject(gltf.scene);
        boyut = sinirKutusu.getSize(new THREE.Vector3());
        enBuyukBoyut = Math.max(boyut.x, boyut.y, boyut.z);
      }

      const merkez = sinirKutusu.getCenter(new THREE.Vector3());

      // Konsola yazdır: model gerçekten nerede ve ne boyutta, kontrol edebilmek için
      console.log("Model sınır kutusu (düzeltilmiş) - merkez:", merkez, "boyut:", boyut);

      // Rig'i modelin merkezine, taban (min.y) seviyesine yerleştir.
      // Göz yüksekliği zaten camera.position.y = 1.6 (rig'e göre yerel) ile sağlanıyor.
      cameraRig.position.set(merkez.x, sinirKutusu.min.y, merkez.z);

      // Modelin boyutuna göre kameranın "far" (görüş uzaklığı) değerini güvenli şekilde ayarla.
      camera.far = Math.max(1000, enBuyukBoyut * 10);
      camera.near = Math.max(0.01, enBuyukBoyut / 1000);
      camera.updateProjectionMatrix();
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
  sesYukleyici.load(
    "muzik.mp3",
    function (buffer) {
      arkaPlanMuzigi.setBuffer(buffer);
      arkaPlanMuzigi.setLoop(true); // Müzik döngü halinde çalsın
      arkaPlanMuzigi.setVolume(0.3); // Ses biraz kısık olsun

      // ÖNEMLİ: Dosya, kullanıcı tıkladıktan SONRA yüklenmiş olabilir (ağ gecikmesi).
      // Kullanıcı zaten etkileşimde bulunduysa (ilkEtkilesim tetiklendiyse),
      // buffer artık hazır olduğu anda müziği hemen başlat.
      if (kullaniciEtkilesimYapildiMi && !arkaPlanMuzigi.isPlaying) {
        arkaPlanMuzigi.play();
        muzikBaslatildiMi = true;
      }
    },
    undefined,
    function (hata) {
      console.error("muzik.mp3 yüklenirken hata oluştu:", hata);
    }
  );
}

// Tarayıcı autoplay politikası gereği müzik ancak kullanıcı etkileşiminden sonra başlayabilir
function ilkEtkilesim() {
  kullaniciEtkilesimYapildiMi = true;

  // Başlangıç katmanını gizle (varsa)
  const baslangicKatmani = document.getElementById("baslangicKatmani");
  if (baslangicKatmani) {
    baslangicKatmani.style.display = "none";
  }

  // Buffer zaten yüklenmişse hemen çal; yüklenmemişse sesKurulumu() içindeki
  // callback, buffer hazır olduğunda kullaniciEtkilesimYapildiMi bayrağını görüp çalacak.
  if (!muzikBaslatildiMi && arkaPlanMuzigi && arkaPlanMuzigi.buffer && !arkaPlanMuzigi.isPlaying) {
    arkaPlanMuzigi.play();
    muzikBaslatildiMi = true;
  }
}

/* ==========================================================
   FARE HAREKETİYLE BAKIŞ (fare tuşu basılı tutulduğunda çalışır)
   ========================================================== */
function fareHareketiyleBak(olay) {
  // Fare tuşu basılı tutulmuyorsa (sürükleme yoksa) hiçbir şey yapma
  if (!fareSurukleniyor) return;

  // Fare hareketi kadar yatay ve dikey açıyı güncelle
  yatayAci -= olay.movementX * FARE_HASSASIYETI;
  dikeyAci -= olay.movementY * FARE_HASSASIYETI;

  // Dikey açıyı sınırla (baş üstü/altı takla atmasını önle)
  dikeyAci = Math.max(-DIKEY_ACI_LIMITI, Math.min(DIKEY_ACI_LIMITI, dikeyAci));

  // Kameranın rotasyonunu uygula. 'YXZ' sırası önemli: önce yatay (Y), sonra dikey (X)
  // dönüşü uygulanır, böylece FPS tarzı bakış doğru çalışır (gimbal lock olmaz).
  camera.rotation.set(dikeyAci, yatayAci, 0, "YXZ");
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
    case "Space":
      olay.preventDefault(); // Sayfanın aşağı kaymasını (scroll) engelle
      tuşlar.yukselme = true;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      tuşlar.alcalma = true;
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
    case "KeyQ":
      tuşlar.yukselme = false;
      break;
    case "KeyE":
      tuşlar.alcalma = false;
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

  // ---------- YÜKSELME / ALÇALMA (Space / Shift) ----------
  // Bakış yönünden bağımsız olarak doğrudan dünya Y ekseninde hareket ettiriyoruz.
  let dikeyHareket = 0;
  if (tuşlar.yukselme) dikeyHareket += HAREKET_HIZI * deltaZaman;
  if (tuşlar.alcalma) dikeyHareket -= HAREKET_HIZI * deltaZaman;
  if (dikeyHareket !== 0) {
    cameraRig.position.y += dikeyHareket;
  }

  renderer.render(scene, camera);
}
