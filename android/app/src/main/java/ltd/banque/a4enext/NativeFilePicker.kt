package ltd.banque.a4enext

import android.content.Intent
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts

/**
 * 网页端 `<input type="file">` 的落地实现：弹系统文件选择器，把结果交回 WebView。
 *
 * **为什么必须有这个类**：WebView 自己不管文件选择器。
 * `WebChromeClient.onShowFileChooser` 的默认实现直接 `return false`，
 * 于是 `<input type="file">` 在 WebView 里**完全没有反应** ——
 * 不弹选择器、不报错、控制台也不说话，点了跟没点一样。
 * 而网页端所有「选文件」入口都建在 `<input type="file">` 上：
 * 存档导入（`SavePanel`）、.d4e 资源包导入（`HomebrewView`）、词条 JSON 导入
 * （`EntryEditor`）、备份恢复（`StorageSettings`）、立绘（`PortraitFrame`）、
 * 背景图（`SettingsView`）—— 在安卓壳里六处会**一起**失灵。
 * 用户看到的就是：点「导入存档」按钮毫无反应。
 *
 * 三条踩过的规则写在这里，改这个文件前先读：
 *
 *   1. **每一次请求都必须回话**（选中 → `Uri[]`；取消 → `null`）。
 *      少回一次，这个 `<input>` 就永远停在「上一次的选择还没结束」，
 *      之后再点一次都没有反应 —— 「取消过一次以后就再也打不开」是这类实现最常见的坑。
 *   2. **一次只留一个回调**。同一时刻理论上只可能有一个 input 在等结果，
 *      真收到第二次就把上一次作废，否则 WebView 卡在旧回调上，新的那个永远等不到。
 *   3. 只做「和运行环境打交道」的部分：选中的文件是什么、格式对不对、怎么入库，
 *      全部仍归网页端（见 `web/src/App.tsx` 的 importSave 与 `lib/backup.ts` 的校验）。
 */
class NativeFilePicker(activity: ComponentActivity) {

    /** 上一次请求里 WebView 交给我们的回调；同一时刻最多一个。 */
    private var pending: ValueCallback<Array<Uri>>? = null

    /**
     * 启动器，必须在 Activity STARTED 之前注册 —— 本类在 `MainActivity.onCreate`
     * 里构造，正好满足（这也是这里用类而不是用「临时 registerForActivityResult」的原因）。
     */
    private val launcher: ActivityResultLauncher<Intent> =
        activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pending ?: return@registerForActivityResult
            pending = null
            // 用平台的 parseResult 解析：单选与多选（clipData）的结构不一样，
            // 用户中途取消时它给 null —— 那条路径也必须回话（见类注释 1）。
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }

    /**
     * 接管一次 `<input type="file">` 的点击。返回值就是 `onShowFileChooser` 的返回值：
     * `true` 表示宿主已经接手。
     */
    fun open(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        // 理论上不会同时来两次；真来了就把上一次作废（见类注释 2），
        // 否则 WebView 会一直等一个永远不会被回答的回调，表现为整个页面之后再也不能选文件。
        pending?.onReceiveValue(null)
        pending = callback

        return try {
            launcher.launch(pickerIntent(params))
            true
        } catch (t: Throwable) {
            // 没有能处理这个意图的 Activity（极少数定制系统上没有「文件」应用）：
            // 回一个 null 并如实返回 false，至少不把 input 永久卡住。
            pending = null
            callback.onReceiveValue(null)
            android.util.Log.w(TAG, "打不开系统文件选择器：" + t.message)
            false
        }
    }

    /**
     * 造一个系统文件选择器的意图。
     *
     * 刻意**不用** `FileChooserParams.createIntent()`：它把网页端的 `accept` 原样塞进
     * `EXTRA_MIME_TYPES`，而这里的 accept 里带的是**扩展名**（`.json` / `.d4e`）。
     * 扩展名不是合法 MIME，部分文件管理器会据此把列表整个滤空 ——
     * 用户看到的是「选择器打开了，但一个文件都点不了」，比现在这个 bug 更难排查。
     *
     * 规则：accept 里**全是**合法 MIME（含 `/`）时才按它过滤（例如立绘的 `image/*`），
     * 只要有一个是扩展名就退回 `*/*` 全部放行 —— 文件内容对不对由网页端自己校验，
     * 选不到文件才是硬故障。
     */
    private fun pickerIntent(params: WebChromeClient.FileChooserParams): Intent {
        val accept = params.acceptTypes?.filter { it.isNotBlank() } ?: emptyList()
        val mimes = accept.takeIf { it.isNotEmpty() && it.all { m -> m.contains('/') } }

        if (params.mode == WebChromeClient.FileChooserParams.MODE_SAVE) {
            // 网页端目前没有用到「保存」型 input，但契约上它有这一支：
            // 落到 ACTION_CREATE_DOCUMENT 上，总好过把用户的点击吞掉。
            return Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mimes?.firstOrNull() ?: "*/*")
                .putExtra(Intent.EXTRA_TITLE, params.filenameHint)
        }

        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            setType("*/*")
            if (mimes != null) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
    }

    private companion object {
        const val TAG = "4enext-picker"
    }
}
