// ==========================================
// 1. SAHNE, KAMERA VE TAŞIYICI (RIG) KURULUMU
// ==========================================
const scene = new THREE.Scene();

// Kamera Taşıyıcısı (Kullanıcı hareket ettiğinde kamerayı ve kontrolcüleri birlikte yürütmek için bir grup oluşturuyoruz)
const cameraRig = new THREE.Group();
scene.add(cameraRig);

// Perspektif Kamera Kurulumu
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 0); // Kamera yüksekliği insan göz hizası olan 1.6 metreye ayarlanır
cameraRig.add(camera); // Kamera, taşıyıcı grubun içerisine dahil edilir

// ==========================================
// 2. RENDERER (İŞLEYİCİ) VE VR AYARLARI
// ==========================================
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Kenar yumuşatma açık
renderer.setSize(window.innerWidth, window.innerHeight);

// Blender'da pişirilen (bake edilen) dokuların doğru renk tonlarında görünmesi için sRGB renk alanı seçilir
renderer.outputEncoding = THREE.sRGBEncoding;

// Sanal gerçeklik (WebXR) desteği aktif hale getirilir
renderer.xr.enabled = true;

// Çizim yapılan canvas elementi HTML sayfasına eklenir
document.body.appendChild(renderer.domElement);

// VR giriş butonu HTML sayfasına dahil edilir
document.body.appendChild(VRButton.createButton(renderer));

// ==========================================
// 3. IŞIKLANDIRMA
// ==========================================
// Gölgeler dokuya pişirildiği için ağır dinamik ışıklar yerine sadece modeli görünür kılacak hafif bir ortam ışığı eklenir
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Beyaz renk, tam yoğunluk
scene.add(ambientLight);

// ==========================================
// 4. PC VE MOBİL İÇİN BAKIŞ KONTROLLERİ
// ==========================================
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, -0.01); // Kameranın kendi ekseninde rahat dönebilmesi için hedef tam önüne konumlandırılır
controls.enableDamping = true; // Dönüş hareketlerine yumuşak bir sürtünme efekti verir
controls.dampingFactor = 0.05;
controls.update();

// ==========================================
// 5. BLENDER MODELİNİN (.GLB) SAHNEYE YÜKLENMESİ
// ==========================================
const loader = new THREE.GLTFLoader();
loader.load(
    'oda.glb', 
    function (gltf) {
        // Model sorunsuz yüklendiğinde sahneye eklenir
        scene.add(gltf.scene);
    }, 
    undefined, 
    function (error) {
        // Olası bir yükleme hatası tarayıcı konsoluna yazdırılır
        console.error('Model yüklenirken bir hata oluştu:', error);
    }
);

// ==========================================
// 6. HAREKET MEKANİZMASI VE DİNLEYİCİLER
// ==========================================
const tuslar = { ileri: false, geri: false, sol: false, sag: false };
const yurumeHizi = 0.03; // Kare başına ilerleme miktarı (Yürüme hızı)

// PC Klavye Tuş Basışları
window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') tuslar.ileri = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') tuslar.geri = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') tuslar.sol = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') tuslar.sag = true;
});

// PC Klavye Tuş Bırakılışları
window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') tuslar.ileri = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') tuslar.geri = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') tuslar.sol = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') tuslar.sag = false;
});

// Mobil Cihazlar İçin Dokunma Hareketi (Ekrana basılı tutulduğu sürece ileri yürür)
let mobilIleri = false;
window.addEventListener('touchstart', () => { mobilIleri = true; });
window.addEventListener('touchend', () => { mobilIleri = false; });

// Yön hesaplamalarında kullanılacak boş vektörler tanımlanır
const yonVektoru = new THREE.Vector3();
const sagVektor = new THREE.Vector3();

// ==========================================
// 7. PENCERE BOYUTU GÜNCELLEME
// ==========================================
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 8. ANİMASYON VE DÖNGÜ SİSTEMİ (RENDER LOOP)
// ==========================================
// WebXR projelerinde klasik requestAnimationFrame yerine setAnimationLoop kullanılması zorunludur
renderer.setAnimationLoop(function () {
    
    // Kameranın o an baktığı yatay yön vektörü hesaplanır
    camera.getWorldDirection(yonVektoru);
    yonVektoru.y = 0; // Kullanıcının zemin üzerinde kalması, yukarı uçmaması için dikey eksen sıfırlanır
    yonVektoru.normalize();

    // Kameranın sağına doğru olan yön vektörü hesaplanır
    sagVektor.crossVectors(camera.up, yonVektoru).normalize();

    // Bu karedeki toplam hareket miktarını tutacak vektör
    const hareket = new THREE.Vector3();

    // -- PC Kontrolleri Uygulanır --
    if (tuslar.ileri) hareket.addScaledVector(yonVektoru, yurumeHizi);
    if (tuslar.geri) hareket.addScaledVector(yonVektoru, -yurumeHizi);
    if (tuslar.sol) hareket.addScaledVector(sagVektor, -yurumeHizi);
    if (tuslar.sag) hareket.addScaledVector(sagVektor, yurumeHizi);

    // -- Mobil Kontrolü Uygulanır --
    if (mobilIleri) hareket.addScaledVector(yonVektoru, yurumeHizi);

    // -- Meta Quest (VR Joystick) Kontrolleri Uygulanır --
    const session = renderer.xr.getSession();
    if (session) {
        for (const source of session.inputSources) {
            if (source && source.gamepad) {
                let xEkseni = 0;
                let yEkseni = 0;

                // Kumanda modeline göre analog çubukların eksen indisleri kontrol edilir
                if (source.gamepad.axes.length >= 4) {
                    xEkseni = source.gamepad.axes[2];
                    yEkseni = source.gamepad.axes[3];
                } else if (source.gamepad.axes.length >= 2) {
                    xEkseni = source.gamepad.axes[0];
                    yEkseni = source.gamepad.axes[1];
                }

                // Yanlışlıkla dokunmaları engellemek için küçük bir eşik değeri (0.2) bırakılır
                if (Math.abs(xEkseni) > 0.2) {
                    hareket.addScaledVector(sagVektor, xEkseni * yurumeHizi);
                }
                if (Math.abs(yEkseni) > 0.2) {
                    hareket.addScaledVector(yonVektoru, yEkseni * yurumeHizi);
                }
            }
        }
    }

    // Herhangi bir cihazdan hareket girdisi gelmişse taşıyıcı rig grubu ve bakış hedefi ötelenir
    if (hareket.lengthSq() > 0) {
        cameraRig.position.add(hareket);
        controls.target.add(hareket);
    }

    // Fare veya dokunma ile bakış yönü güncellenir
    controls.update();

    // Güncel verilerle sahne ekrana basılır
    renderer.render(scene, camera);
});