package com.ahad00010.jatext.data

import android.content.Context
import androidx.compose.runtime.compositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class JaLanguageOption(
    val code: String,
    val nativeName: String,
    val englishName: String,
    val flag: String,
    val rtl: Boolean = false,
) {
    val nativeLabel: String get() = nativeName
    val englishLabel: String get() = englishName
}

val JATEXT_LANGUAGE_OPTIONS: List<JaLanguageOption>
    get() = JaTextI18n.languages

object JaTextI18n {
    private const val PREFS_NAME = "jatext_prefs_v1"
    private const val KEY_LANGUAGE = "app_language_code"

    val languages: List<JaLanguageOption> = listOf(
        JaLanguageOption("en", "English", "English", "🇬🇧"),
        JaLanguageOption("ms", "Bahasa Melayu", "Malay", "🇲🇾"),
        JaLanguageOption("id", "Bahasa Indonesia", "Indonesian", "🇮🇩"),
        JaLanguageOption("zh-CN", "简体中文", "Chinese (Simplified)", "🇨🇳"),
        JaLanguageOption("zh-TW", "繁體中文", "Chinese (Traditional)", "🇹🇼"),
        JaLanguageOption("ja", "日本語", "Japanese", "🇯🇵"),
        JaLanguageOption("ko", "한국어", "Korean", "🇰🇷"),
        JaLanguageOption("es", "Español", "Spanish", "🇪🇸"),
        JaLanguageOption("fr", "Français", "French", "🇫🇷"),
        JaLanguageOption("de", "Deutsch", "German", "🇩🇪"),
        JaLanguageOption("pt", "Português", "Portuguese", "🇧🇷"),
        JaLanguageOption("ru", "Русский", "Russian", "🇷🇺"),
        JaLanguageOption("ar", "العربية", "Arabic", "🇸🇦", rtl = true),
        JaLanguageOption("hi", "हिन्दी", "Hindi", "🇮🇳"),
        JaLanguageOption("tr", "Türkçe", "Turkish", "🇹🇷"),
        JaLanguageOption("vi", "Tiếng Việt", "Vietnamese", "🇻🇳"),
        JaLanguageOption("th", "ไทย", "Thai", "🇹🇭"),
    )

    private val _currentLanguage = MutableStateFlow("en")
    val currentLanguage: StateFlow<String> = _currentLanguage.asStateFlow()

    fun init(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_LANGUAGE, "en") ?: "en"
        if (languages.any { it.code == saved }) {
            _currentLanguage.value = saved
        }
    }

    fun setLanguage(context: Context, code: String) {
        if (languages.none { it.code == code }) return
        _currentLanguage.value = code
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANGUAGE, code)
            .apply()
    }

    private val en = mapOf(
        "chats" to "Chats",
        "calls" to "Calls",
        "add" to "Add",
        "settings" to "Settings",
        "search_chats" to "Search chats",
        "search_messages" to "Search in chat",
        "all_chats" to "All",
        "new_folder" to "New folder",
        "folders" to "Folders",
        "pin_chat" to "Pin to top",
        "unpin_chat" to "Unpin",
        "move_up" to "Move up",
        "move_down" to "Move down",
        "pin_message" to "Pin message",
        "unpin_message" to "Unpin message",
        "pinned_messages" to "Pinned messages",
        "draft" to "Draft",
        "view_once" to "View once",
        "click_to_view" to "Click to view.",
        "view_once_burned" to "You can only view this once.",
        "learn_more" to "Learn more.",
        "profile" to "Profile",
        "appearance" to "Appearance",
        "privacy" to "Privacy",
        "alerts_audio" to "Alerts & Audio",
        "linked_devices" to "Linked Devices",
        "languages" to "Languages",
        "blocked_users" to "Blocked users",
        "see_blocked_users" to "See the lists of users whom you blocked.",
        "unblock" to "Unblock",
        "no_blocked_users" to "You have not blocked anyone.",
        "soundboards" to "Soundboards",
        "add_soundboard" to "Add custom sound",
        "two_factor_title" to "2FA",
        "setup_2fa" to "Set up 2FA authentication",
        "disable_2fa" to "Disable 2FA",
        "enter_auth_code" to "Enter your authentication code",
        "passkeys" to "Passkeys",
        "add_passkey" to "Create a passkey",
        "sign_in_passkey" to "Sign in with Passkey",
        "type_message" to "Message",
        "upload_attachment" to "Upload attachment",
        "schedule_message" to "Schedule message",
        "socials" to "Socials",
        "legal" to "Legal",
        "soundboards_desc" to "Upload custom audio clips (max 10 MB, max 10s) to play during 1:1 and Group calls.",
        "languages_desc" to "Choose your preferred display language across JaText.",
    )

    private val dicts: Map<String, Map<String, String>> = mapOf(
        "en" to en,
        "ms" to mapOf(
            "chats" to "Sembang", "calls" to "Panggilan", "add" to "Tambah", "settings" to "Tetapan",
            "search_chats" to "Cari sembang", "search_messages" to "Cari dalam mesej", "all_chats" to "Semua",
            "new_folder" to "Folder baharu", "folders" to "Folder", "pin_chat" to "Pin sembang", "unpin_chat" to "Nyahpin",
            "move_up" to "Gerak ke atas", "move_down" to "Gerak ke bawah", "pin_message" to "Pin mesej", "unpin_message" to "Nyahpin mesej",
            "pinned_messages" to "Mesej dipin", "draft" to "Draf", "view_once" to "Lihat sekali",
            "click_to_view" to "Klik untuk lihat.", "view_once_burned" to "Anda hanya boleh melihat ini sekali.", "learn_more" to "Ketahui lanjut.",
            "profile" to "Profil", "appearance" to "Penampilan", "privacy" to "Privasi", "alerts_audio" to "Isyarat & Audio",
            "linked_devices" to "Peranti Dipautkan", "languages" to "Bahasa", "blocked_users" to "Pengguna disekat",
            "see_blocked_users" to "Lihat senarai pengguna yang anda sekat.", "unblock" to "Nyahsekat",
            "no_blocked_users" to "Tiada pengguna disekat.", "soundboards" to "Papan Bunyi", "add_soundboard" to "Tambah bunyi tersuai",
            "two_factor_title" to "2FA", "setup_2fa" to "Sediakan pengesahan 2FA", "enter_auth_code" to "Masukkan kod pengesahan anda",
            "passkeys" to "Passkey", "add_passkey" to "Cipta Passkey", "sign_in_passkey" to "Log masuk dengan Passkey", "type_message" to "Mesej",
        ),
        "id" to mapOf(
            "chats" to "Obrolan", "calls" to "Panggilan", "add" to "Tambah", "settings" to "Pengaturan",
            "search_chats" to "Cari obrolan", "search_messages" to "Cari pesan", "all_chats" to "Semua",
            "new_folder" to "Folder baru", "folders" to "Folder", "pin_chat" to "Sematkan", "unpin_chat" to "Lepas sematan",
            "move_up" to "Pindah ke atas", "move_down" to "Pindah ke bawah", "pin_message" to "Sematkan pesan", "unpin_message" to "Lepas sematan pesan",
            "pinned_messages" to "Pesan disematkan", "draft" to "Draf", "view_once" to "Sekali lihat",
            "click_to_view" to "Klik untuk melihat.", "view_once_burned" to "Anda hanya dapat melihat ini sekali.", "learn_more" to "Pelajari lebih lanjut.",
            "profile" to "Profil", "appearance" to "Tampilan", "privacy" to "Privasi", "alerts_audio" to "Notifikasi & Audio",
            "linked_devices" to "Perangkat Tertaut", "languages" to "Bahasa", "blocked_users" to "Pengguna diblokir",
            "see_blocked_users" to "Lihat daftar pengguna yang Anda blokir.", "unblock" to "Buka blokir",
            "no_blocked_users" to "Belum ada pengguna yang diblokir.", "soundboards" to "Papan Suara", "add_soundboard" to "Tambah suara kustom",
            "two_factor_title" to "2FA", "setup_2fa" to "Atur autentikasi 2FA", "enter_auth_code" to "Masukkan kode autentikasi Anda",
            "passkeys" to "Passkey", "add_passkey" to "Buat Passkey", "sign_in_passkey" to "Masuk dengan Passkey", "type_message" to "Pesan",
        ),
        "zh-CN" to mapOf(
            "chats" to "聊天", "calls" to "通话", "add" to "添加", "settings" to "设置",
            "search_chats" to "搜索聊天", "search_messages" to "搜索聊天记录", "all_chats" to "全部",
            "new_folder" to "新建分组", "folders" to "分组", "pin_chat" to "置顶聊天", "unpin_chat" to "取消置顶",
            "move_up" to "上移", "move_down" to "下移", "pin_message" to "置顶消息", "unpin_message" to "取消置顶消息",
            "pinned_messages" to "置顶消息", "draft" to "草稿", "view_once" to "阅后即焚",
            "click_to_view" to "点击查看。", "view_once_burned" to "此消息仅可查看一次。", "learn_more" to "了解更多。",
            "profile" to "个人资料", "appearance" to "外观", "privacy" to "隐私与安全", "alerts_audio" to "通知与音频",
            "linked_devices" to "已关联设备", "languages" to "语言", "blocked_users" to "已屏蔽用户",
            "see_blocked_users" to "查看你屏蔽的用户列表。", "unblock" to "解除屏蔽",
            "no_blocked_users" to "你尚未屏蔽任何用户。", "soundboards" to "音效板", "add_soundboard" to "添加自定义音效",
            "two_factor_title" to "2FA", "setup_2fa" to "设置 2FA 双重验证", "enter_auth_code" to "请输入身份验证器验证码",
            "passkeys" to "通行密钥", "add_passkey" to "创建通行密钥", "sign_in_passkey" to "使用通行密钥登录", "type_message" to "输入消息",
        ),
        "zh-TW" to mapOf(
            "chats" to "聊天", "calls" to "通話", "add" to "新增", "settings" to "設定",
            "search_chats" to "搜尋聊天", "search_messages" to "搜尋對話訊息", "all_chats" to "全部",
            "new_folder" to "新增資料夾", "folders" to "資料夾", "pin_chat" to "釘選聊天", "unpin_chat" to "取消釘選",
            "move_up" to "上移", "move_down" to "下移", "pin_message" to "釘選訊息", "unpin_message" to "取消釘選訊息",
            "pinned_messages" to "已釘選訊息", "draft" to "草稿", "view_once" to "單次檢視",
            "click_to_view" to "點擊檢視。", "view_once_burned" to "此內容僅能檢視一次。", "learn_more" to "瞭解詳情。",
            "profile" to "個人檔案", "appearance" to "外觀", "privacy" to "隱私與安全", "alerts_audio" to "通知與音訊",
            "linked_devices" to "已連結裝置", "languages" to "語言", "blocked_users" to "封鎖的使用者",
            "see_blocked_users" to "查看你已封鎖的使用者名單。", "unblock" to "解除封鎖",
            "no_blocked_users" to "目前沒有封鎖任何使用者。", "soundboards" to "音效板", "add_soundboard" to "新增自訂音效",
            "two_factor_title" to "2FA", "setup_2fa" to "設定 2FA 雙重驗證", "enter_auth_code" to "輸入你的驗證碼",
            "passkeys" to "通行密鑰", "add_passkey" to "建立通行密鑰", "sign_in_passkey" to "使用通行密鑰登入", "type_message" to "輸入訊息",
        ),
        "ja" to mapOf(
            "chats" to "チャット", "calls" to "通話", "add" to "追加", "settings" to "設定",
            "search_chats" to "チャットを検索", "search_messages" to "メッセージを検索", "all_chats" to "すべて",
            "new_folder" to "新しいフォルダ", "folders" to "フォルダ", "pin_chat" to "ピン留め", "unpin_chat" to "ピン留め解除",
            "move_up" to "上へ移動", "move_down" to "下へ移動", "pin_message" to "メッセージをピン留め", "unpin_message" to "ピン留めを解除",
            "pinned_messages" to "ピン留めメッセージ", "draft" to "下書き", "view_once" to "1回表示",
            "click_to_view" to "クリックして表示。", "view_once_burned" to "このメッセージは1回しか表示できません。", "learn_more" to "詳細を見る。",
            "profile" to "プロフィール", "appearance" to "外観", "privacy" to "プライバシー", "alerts_audio" to "通知とオーディオ",
            "linked_devices" to "リンク済みデバイス", "languages" to "言語", "blocked_users" to "ブロック中のユーザー",
            "see_blocked_users" to "ブロックしたユーザーの一覧を表示します。", "unblock" to "ブロック解除",
            "no_blocked_users" to "ブロック中のユーザーはいません。", "soundboards" to "サウンドボード", "add_soundboard" to "カスタム音声を追加",
            "two_factor_title" to "2FA", "setup_2fa" to "2FA認証を設定する", "enter_auth_code" to "認証コードを入力してください",
            "passkeys" to "パスキー", "add_passkey" to "パスキーを作成", "sign_in_passkey" to "パスキーでサインイン", "type_message" to "メッセージ",
        ),
        "ko" to mapOf(
            "chats" to "채팅", "calls" to "통화", "add" to "추가", "settings" to "설정",
            "search_chats" to "채팅 검색", "search_messages" to "대화 내용 검색", "all_chats" to "전체",
            "new_folder" to "새 폴더", "folders" to "폴더", "pin_chat" to "상단 고정", "unpin_chat" to "고정 해제",
            "move_up" to "위로 이동", "move_down" to "아래로 이동", "pin_message" to "메시지 고정", "unpin_message" to "메시지 고정 해제",
            "pinned_messages" to "고정된 메시지", "draft" to "임시저장", "view_once" to "한 번만 보기",
            "click_to_view" to "클릭하여 보기.", "view_once_burned" to "이 메시지는 한 번만 볼 수 있습니다.", "learn_more" to "자세히 알아보기.",
            "profile" to "프로필", "appearance" to "화면 테마", "privacy" to "개인정보 및 보안", "alerts_audio" to "알림 및 오디오",
            "linked_devices" to "연결된 기기", "languages" to "언어", "blocked_users" to "차단된 사용자",
            "see_blocked_users" to "차단한 사용자 목록을 확인합니다.", "unblock" to "차단 해제",
            "no_blocked_users" to "차단한 사용자가 없습니다.", "soundboards" to "사운드보드", "add_soundboard" to "커스텀 사운드 추가",
            "two_factor_title" to "2FA", "setup_2fa" to "2FA 인증 설정하기", "enter_auth_code" to "인증 앱 코드를 입력하세요",
            "passkeys" to "패스키", "add_passkey" to "패스키 만들기", "sign_in_passkey" to "패스키로 로그인", "type_message" to "메시지 입력",
        ),
        "es" to mapOf(
            "chats" to "Chats", "calls" to "Llamadas", "add" to "Añadir", "settings" to "Ajustes",
            "search_chats" to "Buscar chats", "search_messages" to "Buscar en el chat", "all_chats" to "Todos",
            "new_folder" to "Nueva carpeta", "folders" to "Carpetas", "pin_chat" to "Fijar chat", "unpin_chat" to "Desfijar",
            "move_up" to "Subir", "move_down" to "Bajar", "pin_message" to "Fijar mensaje", "unpin_message" to "Desfijar mensaje",
            "pinned_messages" to "Mensajes fijados", "draft" to "Borrador", "view_once" to "Ver una vez",
            "click_to_view" to "Haz clic para ver.", "view_once_burned" to "Solo puedes ver esto una vez.", "learn_more" to "Más información.",
            "profile" to "Perfil", "appearance" to "Apariencia", "privacy" to "Privacidad", "alerts_audio" to "Alertas y audio",
            "linked_devices" to "Dispositivos vinculados", "languages" to "Idiomas", "blocked_users" to "Usuarios bloqueados",
            "see_blocked_users" to "Ver la lista de usuarios que bloqueaste.", "unblock" to "Desbloquear",
            "no_blocked_users" to "No has bloqueado a nadie.", "soundboards" to "Panel de sonidos", "add_soundboard" to "Añadir sonido",
            "two_factor_title" to "2FA", "setup_2fa" to "Configurar autenticación 2FA", "enter_auth_code" to "Introduce tu código de autenticación",
            "passkeys" to "Passkeys", "add_passkey" to "Crear llave de acceso", "sign_in_passkey" to "Iniciar sesión con Passkey", "type_message" to "Mensaje",
        ),
        "fr" to mapOf(
            "chats" to "Discussions", "calls" to "Appels", "add" to "Ajouter", "settings" to "Paramètres",
            "search_chats" to "Rechercher", "search_messages" to "Rechercher dans le chat", "all_chats" to "Tous",
            "new_folder" to "Nouveau dossier", "folders" to "Dossiers", "pin_chat" to "Épingler", "unpin_chat" to "Désépingler",
            "move_up" to "Monter", "move_down" to "Descendre", "pin_message" to "Épingler le message", "unpin_message" to "Désépingler",
            "pinned_messages" to "Messages épinglés", "draft" to "Brouillon", "view_once" to "Vue unique",
            "click_to_view" to "Cliquez pour voir.", "view_once_burned" to "Vous ne pouvez voir ceci qu'une seule fois.", "learn_more" to "En savoir plus.",
            "profile" to "Profil", "appearance" to "Apparence", "privacy" to "Confidentialité", "alerts_audio" to "Alertes et audio",
            "linked_devices" to "Appareils liés", "languages" to "Langues", "blocked_users" to "Utilisateurs bloqués",
            "see_blocked_users" to "Voir la liste des utilisateurs que vous avez bloqués.", "unblock" to "Débloquer",
            "no_blocked_users" to "Aucun utilisateur bloqué.", "soundboards" to "Boîte à sons", "add_soundboard" to "Ajouter un son",
            "two_factor_title" to "2FA", "setup_2fa" to "Configurer l'authentification 2FA", "enter_auth_code" to "Entrez votre code d'authentification",
            "passkeys" to "Passkeys", "add_passkey" to "Créer une clé d'accès", "sign_in_passkey" to "Se connecter avec Passkey", "type_message" to "Message",
        ),
        "de" to mapOf(
            "chats" to "Chats", "calls" to "Anrufe", "add" to "Hinzufügen", "settings" to "Einstellungen",
            "search_chats" to "Chats durchsuchen", "search_messages" to "Im Chat suchen", "all_chats" to "Alle",
            "new_folder" to "Neuer Ordner", "folders" to "Ordner", "pin_chat" to "Anheften", "unpin_chat" to "Lösen",
            "move_up" to "Nach oben", "move_down" to "Nach unten", "pin_message" to "Nachricht anheften", "unpin_message" to "Nachricht lösen",
            "pinned_messages" to "Angeheftete Nachrichten", "draft" to "Entwurf", "view_once" to "Einmal ansehen",
            "click_to_view" to "Zum Ansehen klicken.", "view_once_burned" to "Du kannst dies nur einmal ansehen.", "learn_more" to "Mehr erfahren.",
            "profile" to "Profil", "appearance" to "Darstellung", "privacy" to "Datenschutz", "alerts_audio" to "Töne & Audio",
            "linked_devices" to "Verknüpfte Geräte", "languages" to "Sprachen", "blocked_users" to "Blockierte Nutzer",
            "see_blocked_users" to "Liste der von dir blockierten Nutzer anzeigen.", "unblock" to "Freigeben",
            "no_blocked_users" to "Keine blockierten Nutzer.", "soundboards" to "Soundboards", "add_soundboard" to "Eigenen Sound hinzufügen",
            "two_factor_title" to "2FA", "setup_2fa" to "2FA-Authentifizierung einrichten", "enter_auth_code" to "Gib deinen Authentifizierungscode ein",
            "passkeys" to "Passkeys", "add_passkey" to "Passkey erstellen", "sign_in_passkey" to "Mit Passkey anmelden", "type_message" to "Nachricht",
        ),
        "pt" to mapOf(
            "chats" to "Conversas", "calls" to "Chamadas", "add" to "Adicionar", "settings" to "Configurações",
            "search_chats" to "Pesquisar conversas", "search_messages" to "Pesquisar na conversa", "all_chats" to "Todas",
            "new_folder" to "Nova pasta", "folders" to "Pastas", "pin_chat" to "Fixar conversa", "unpin_chat" to "Desafixar",
            "move_up" to "Mover para cima", "move_down" to "Mover para baixo", "pin_message" to "Fixar mensagem", "unpin_message" to "Desafixar mensagem",
            "pinned_messages" to "Mensagens fixadas", "draft" to "Rascunho", "view_once" to "Visualização única",
            "click_to_view" to "Clique para ver.", "view_once_burned" to "Você só pode ver isto uma vez.", "learn_more" to "Saiba mais.",
            "profile" to "Perfil", "appearance" to "Aparência", "privacy" to "Privacidade", "alerts_audio" to "Alertas e Áudio",
            "linked_devices" to "Aparelhos conectados", "languages" to "Idiomas", "blocked_users" to "Usuários bloqueados",
            "see_blocked_users" to "Ver a lista de usuários que você bloqueou.", "unblock" to "Desbloquear",
            "no_blocked_users" to "Nenhum usuário bloqueado.", "soundboards" to "Painel de sons", "add_soundboard" to "Adicionar som",
            "two_factor_title" to "2FA", "setup_2fa" to "Configurar autenticação 2FA", "enter_auth_code" to "Digite seu código de autenticação",
            "passkeys" to "Passkeys", "add_passkey" to "Criar Passkey", "sign_in_passkey" to "Entrar com Passkey", "type_message" to "Mensagem",
        ),
        "ru" to mapOf(
            "chats" to "Чаты", "calls" to "Звонки", "add" to "Добавить", "settings" to "Настройки",
            "search_chats" to "Поиск чатов", "search_messages" to "Поиск в чате", "all_chats" to "Все",
            "new_folder" to "Новая папка", "folders" to "Папки", "pin_chat" to "Закрепить", "unpin_chat" to "Открепить",
            "move_up" to "Вверх", "move_down" to "Вниз", "pin_message" to "Закрепить сообщение", "unpin_message" to "Открепить сообщение",
            "pinned_messages" to "Закреплённые сообщения", "draft" to "Черновик", "view_once" to "Один просмотр",
            "click_to_view" to "Нажмите для просмотра.", "view_once_burned" to "Это можно просмотреть только один раз.", "learn_more" to "Подробнее.",
            "profile" to "Профиль", "appearance" to "Оформление", "privacy" to "Конфиденциальность", "alerts_audio" to "Уведомления и звук",
            "linked_devices" to "Связанные устройства", "languages" to "Языки", "blocked_users" to "Заблокированные",
            "see_blocked_users" to "Посмотреть список заблокированных пользователей.", "unblock" to "Разблокировать",
            "no_blocked_users" to "Список блокировки пуст.", "soundboards" to "Саундборд", "add_soundboard" to "Добавить звук",
            "two_factor_title" to "2FA", "setup_2fa" to "Настроить 2FA аутентификацию", "enter_auth_code" to "Введите код аутентификации",
            "passkeys" to "Passkeys", "add_passkey" to "Создать ключ входа", "sign_in_passkey" to "Войти с Passkey", "type_message" to "Сообщение",
        ),
        "ar" to mapOf(
            "chats" to "الدردشات", "calls" to "المكالمات", "add" to "إضافة", "settings" to "الإعدادات",
            "search_chats" to "البحث في الدردشات", "search_messages" to "البحث داخل المحادثة", "all_chats" to "الكل",
            "new_folder" to "مجلد جديد", "folders" to "المجلدات", "pin_chat" to "تثبيت المحادثة", "unpin_chat" to "إلغاء التثبيت",
            "move_up" to "تحريك لأعلى", "move_down" to "تحريك لأسفل", "pin_message" to "تثبيت الرسالة", "unpin_message" to "إلغاء تثبيت الرسالة",
            "pinned_messages" to "الرسائل المثبتة", "draft" to "مسودة", "view_once" to "العرض لمرة واحدة",
            "click_to_view" to "انقر للعرض.", "view_once_burned" to "يمكنك عرض هذه الرسالة مرة واحدة فقط.", "learn_more" to "اعرف المزيد.",
            "profile" to "الملف الشخصي", "appearance" to "المظهر", "privacy" to "الخصوصية", "alerts_audio" to "التنبيهات والصوت",
            "linked_devices" to "الأجهزة المرتبطة", "languages" to "اللغات", "blocked_users" to "المستخدمون المحظورون",
            "see_blocked_users" to "اعرض قائمة المستخدمين الذين قمت بحظرهم.", "unblock" to "إلغاء الحظر",
            "no_blocked_users" to "لم تقم بحظر أي مستخدم.", "soundboards" to "لوحة الأصوات", "add_soundboard" to "إضافة مقطع صوتي",
            "two_factor_title" to "2FA", "setup_2fa" to "إعداد المصادقة الثنائية 2FA", "enter_auth_code" to "أدخل رمز المصادقة الخاص بك",
            "passkeys" to "Passkeys", "add_passkey" to "إنشاء مفتاح مرور", "sign_in_passkey" to "تسجيل الدخول بمفتاح المرور", "type_message" to "رسالة",
        ),
        "hi" to mapOf(
            "chats" to "चैट", "calls" to "कॉल", "add" to "जोड़ें", "settings" to "सेटिंग्स",
            "search_chats" to "चैट खोजें", "search_messages" to "चैट में खोजें", "all_chats" to "सभी",
            "new_folder" to "नया फ़ोल्डर", "folders" to "फ़ोल्डर", "pin_chat" to "पिन करें", "unpin_chat" to "अनपिन करें",
            "move_up" to "ऊपर ले जाएं", "move_down" to "नीचे ले जाएं", "pin_message" to "मैसेज पिन करें", "unpin_message" to "मैसेज अनपिन करें",
            "pinned_messages" to "पिन किए गए मैसेज", "draft" to "ड्राफ्ट", "view_once" to "एक बार देखें",
            "click_to_view" to "देखने के लिए क्लिक करें।", "view_once_burned" to "आप इसे केवल एक बार देख सकते हैं।", "learn_more" to "और जानें।",
            "profile" to "प्रोफ़ाइल", "appearance" to "दिखावट", "privacy" to "गोपनीयता", "alerts_audio" to "अलर्ट और ऑडियो",
            "linked_devices" to "लिंक किए गए डिवाइस", "languages" to "भाषाएँ", "blocked_users" to "ब्लॉक किए गए उपयोगकर्ता",
            "see_blocked_users" to "उन उपयोगकर्ताओं की सूची देखें जिन्हें आपने ब्लॉक किया है।", "unblock" to "अनब्लॉक",
            "no_blocked_users" to "आपने किसी को ब्लॉक नहीं किया है।", "soundboards" to "साउंडबोर्ड", "add_soundboard" to "कस्टम साउंड जोड़ें",
            "two_factor_title" to "2FA", "setup_2fa" to "2FA प्रमाणीकरण सेट करें", "enter_auth_code" to "अपना प्रमाणीकरण कोड दर्ज करें",
            "passkeys" to "Passkeys", "add_passkey" to "पासकी बनाएं", "sign_in_passkey" to "पासकी से साइन इन करें", "type_message" to "मैसेज",
        ),
        "tr" to mapOf(
            "chats" to "Sohbetler", "calls" to "Aramalar", "add" to "Ekle", "settings" to "Ayarlar",
            "search_chats" to "Sohbet ara", "search_messages" to "Sohbette ara", "all_chats" to "Tümü",
            "new_folder" to "Yeni klasör", "folders" to "Klasörler", "pin_chat" to "Sabitle", "unpin_chat" to "Sabitlemeyi kaldır",
            "move_up" to "Yukarı taşı", "move_down" to "Aşağı taşı", "pin_message" to "Mesajı sabitle", "unpin_message" to "Sabitlemeyi kaldır",
            "pinned_messages" to "Sabitlenmiş mesajlar", "draft" to "Taslak", "view_once" to "Bir kez görüntüle",
            "click_to_view" to "Görüntülemek için tıklayın.", "view_once_burned" to "Bunu yalnızca bir kez görüntüleyebilirsiniz.", "learn_more" to "Daha fazla bilgi.",
            "profile" to "Profil", "appearance" to "Görünüm", "privacy" to "Gizlilik", "alerts_audio" to "Bildirimler ve Ses",
            "linked_devices" to "Bağlı Cihazlar", "languages" to "Diller", "blocked_users" to "Engellenen kullanıcılar",
            "see_blocked_users" to "Engellediğiniz kullanıcıların listesini görün.", "unblock" to "Engeli kaldır",
            "no_blocked_users" to "Engellenen kullanıcı yok.", "soundboards" to "Ses Tahtası", "add_soundboard" to "Özel ses ekle",
            "two_factor_title" to "2FA", "setup_2fa" to "2FA kimlik doğrulamayı kur", "enter_auth_code" to "Kimlik doğrulama kodunuzu girin",
            "passkeys" to "Passkeys", "add_passkey" to "Passkey oluştur", "sign_in_passkey" to "Passkey ile giriş yap", "type_message" to "Mesaj",
        ),
        "vi" to mapOf(
            "chats" to "Trò chuyện", "calls" to "Cuộc gọi", "add" to "Thêm", "settings" to "Cài đặt",
            "search_chats" to "Tìm cuộc trò chuyện", "search_messages" to "Tìm trong đoạn chat", "all_chats" to "Tất cả",
            "new_folder" to "Thư mục mới", "folders" to "Thư mục", "pin_chat" to "Ghim hội thoại", "unpin_chat" to "Bỏ ghim",
            "move_up" to "Chuyển lên", "move_down" to "Chuyển xuống", "pin_message" to "Ghim tin nhắn", "unpin_message" to "Bỏ ghim tin nhắn",
            "pinned_messages" to "Tin nhắn đã ghim", "draft" to "Bản nháp", "view_once" to "Xem một lần",
            "click_to_view" to "Nhấn để xem.", "view_once_burned" to "Bạn chỉ có thể xem nội dung này một lần.", "learn_more" to "Tìm hiểu thêm.",
            "profile" to "Hồ sơ", "appearance" to "Giao diện", "privacy" to "Quyền riêng tư", "alerts_audio" to "Thông báo & Âm thanh",
            "linked_devices" to "Thiết bị đã liên kết", "languages" to "Ngôn ngữ", "blocked_users" to "Người dùng đã chặn",
            "see_blocked_users" to "Xem danh sách những người dùng bạn đã chặn.", "unblock" to "Bỏ chặn",
            "no_blocked_users" to "Bạn chưa chặn ai.", "soundboards" to "Bảng âm thanh", "add_soundboard" to "Thêm âm thanh",
            "two_factor_title" to "2FA", "setup_2fa" to "Thiết lập xác thực 2FA", "enter_auth_code" to "Nhập mã xác thực của bạn",
            "passkeys" to "Passkey", "add_passkey" to "Tạo Passkey", "sign_in_passkey" to "Đăng nhập bằng Passkey", "type_message" to "Tin nhắn",
        ),
        "th" to mapOf(
            "chats" to "แชท", "calls" to "การโทร", "add" to "เพิ่ม", "settings" to "การตั้งค่า",
            "search_chats" to "ค้นหาแชท", "search_messages" to "ค้นหาในแชท", "all_chats" to "ทั้งหมด",
            "new_folder" to "โฟลเดอร์ใหม่", "folders" to "โฟลเดอร์", "pin_chat" to "ปักหมุดแชท", "unpin_chat" to "เลิกปักหมุด",
            "move_up" to "เลื่อนขึ้น", "move_down" to "เลื่อนลง", "pin_message" to "ปักหมุดข้อความ", "unpin_message" to "เลิกปักหมุดข้อความ",
            "pinned_messages" to "ข้อความที่ปักหมุด", "draft" to "แบบร่าง", "view_once" to "ดูครั้งเดียว",
            "click_to_view" to "คลิกเพื่อดู", "view_once_burned" to "คุณสามารถดูข้อความนี้ได้เพียงครั้งเดียว", "learn_more" to "เรียนรู้เพิ่มเติม",
            "profile" to "โปรไฟล์", "appearance" to "รูปลักษณ์", "privacy" to "ความเป็นส่วนตัว", "alerts_audio" to "การแจ้งเตือนและเสียง",
            "linked_devices" to "อุปกรณ์ที่เชื่อมต่อ", "languages" to "ภาษา", "blocked_users" to "ผู้ใช้ที่บล็อก",
            "see_blocked_users" to "ดูรายชื่อผู้ใช้ที่คุณบล็อกไว้", "unblock" to "เลิกบล็อก",
            "no_blocked_users" to "ยังไม่มีผู้ใช้ที่ถูกบล็อก", "soundboards" to "ซาวด์บอร์ด", "add_soundboard" to "เพิ่มเสียงคัสตอม",
            "two_factor_title" to "2FA", "setup_2fa" to "ตั้งค่าการยืนยันตัวตน 2FA", "enter_auth_code" to "กรอกรหัสยืนยันตัวตนของคุณ",
            "passkeys" to "พาสคีย์", "add_passkey" to "สร้างพาสคีย์", "sign_in_passkey" to "เข้าสู่ระบบด้วยพาสคีย์", "type_message" to "ข้อความ",
        ),
    )

    private val keyAliases: Map<String, String> = mapOf(
        "sidebar.search" to "search_chats",
        "sidebar.folders.all" to "all_chats",
        "sidebar.folders.new" to "new_folder",
        "sidebar.draft" to "draft",
        "sidebar.pin" to "pin_chat",
        "sidebar.unpin" to "unpin_chat",
        "sidebar.moveUp" to "move_up",
        "sidebar.moveDown" to "move_down",
        "nav.chats" to "chats",
        "nav.calls" to "calls",
        "nav.add" to "add",
        "nav.settings" to "settings",
        "chat.searchInChat" to "search_messages",
        "chat.pinned" to "pinned_messages",
        "chat.typeMessage" to "type_message",
        "chat.pinMessage" to "pin_message",
        "chat.unpinMessage" to "unpin_message",
        "plus.upload" to "upload_attachment",
        "plus.viewOnce" to "view_once",
        "plus.schedule" to "schedule_message",
        "settings.profile" to "profile",
        "settings.appearance" to "appearance",
        "settings.devices" to "linked_devices",
        "settings.socials" to "socials",
        "settings.alerts" to "alerts_audio",
        "settings.privacy" to "privacy",
        "settings.legal" to "legal",
        "blocked.title" to "blocked_users",
        "blocked.cta" to "see_blocked_users",
        "blocked.empty" to "no_blocked_users",
        "blocked.unblock" to "unblock",
        "soundboard.title" to "soundboards",
        "soundboard.desc" to "soundboards_desc",
        "soundboard.add" to "add_soundboard",
        "twofa.title" to "two_factor_title",
        "twofa.disable" to "disable_2fa",
        "twofa.setup" to "setup_2fa",
        "passkeys.title" to "passkeys",
        "passkeys.add" to "add_passkey",
        "appearance.languages" to "languages",
        "appearance.languagesDesc" to "languages_desc",
    )

    fun tr(key: String, lang: String = _currentLanguage.value): String {
        val canonical = keyAliases[key] ?: key
        return dicts[lang]?.get(canonical) ?: en[canonical] ?: canonical
    }
}

fun jt(key: String, lang: String = JaTextI18n.currentLanguage.value): String =
    JaTextI18n.tr(key, lang)

val LocalJaTextLanguage = compositionLocalOf { "en" }
