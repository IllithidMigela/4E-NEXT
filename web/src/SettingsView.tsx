import { useRef, type ChangeEvent } from "react";
import { useTheme, type BgMode } from "./ThemeProvider";
import { FilledSelect, SelectOption, Switch, FilledButton, Slider } from "./components/md";
import { readFileAsDataUrl } from "./lib/image";
import { NORD_PRESETS, type SeedMode } from "./theme";

export default function SettingsView() {
  const { seedMode, seedHex, presetHex, isDark, setSeedMode, setSeedHex, setPresetHex, setDark, bgMode, setBgMode, setBgCustom, bgImage, bgBlur, bgFeather, setBgBlur, setBgFeather } = useTheme();
  const bgFileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  async function onBgFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBgCustom(await readFileAsDataUrl(f));
    e.target.value = "";
  }

  return (
    <div className="settings">
      <section className="block">
        <h3 className="block-title">外观设置</h3>
        <div className="settings-row">
          <span className="field-label">深浅模式</span>
          <Switch selected={isDark} onChange={(e) => setDark((e.target as any).selected)} />
          <span className="label">{isDark ? "深色" : "浅色"}</span>
        </div>
        <div className="settings-row">
          <span className="field-label">动态取色种子</span>
          <FilledSelect value={seedMode} onChange={(e) => setSeedMode((e.target as any).value as SeedMode)}>
            <SelectOption value="preset">预设</SelectOption>
            <SelectOption value="picker">自选</SelectOption>
            <SelectOption value="portrait">跟随立绘</SelectOption>
            <SelectOption value="background">跟随背景</SelectOption>
          </FilledSelect>
        </div>
        {seedMode === "preset" && (
          <div className="settings-row">
            <div className="swatch-row">
              {NORD_PRESETS.map((p) => (
                <button key={p.color} type="button" className={presetHex === p.color ? "swatch active" : "swatch"} style={{ background: p.color }} title={p.name} onClick={() => setPresetHex(p.color)} />
              ))}
            </div>
          </div>
        )}
        {seedMode === "picker" && (
          <div className="settings-row">
            <span className="field-label">种子色</span>
            <button type="button" className={presetHex === seedHex ? "swatch active" : "swatch"} style={{ background: seedHex }} title="点击打开浏览器色板" onClick={() => colorRef.current?.showPicker()} />
            <input ref={colorRef} type="color" value={seedHex} onChange={(e) => setSeedHex(e.target.value)} style={{ display: "none" }} />
          </div>
        )}
        {seedMode === "portrait" && <p className="hint">取色来自车卡页上传的立绘原图（非裁切版本）。</p>}
        {seedMode === "background" && !bgImage && <p className="hint">尚未设置背景图，将回退到默认色。请先在下方「背景」中开启。</p>}
      </section>

      <section className="block">
        <h3 className="block-title">背景</h3>
        <div className="settings-row">
          <span className="field-label">背景图</span>
          <Switch selected={bgMode !== "off"} onChange={(e) => setBgMode((e.target as any).selected ? "portrait" : "off")} />
          <span className="label">{bgMode !== "off" ? "开启" : "关闭（默认）"}</span>
        </div>
        {bgMode !== "off" && (
          <>
            <div className="settings-row">
              <span className="field-label">背景来源</span>
              <FilledSelect value={bgMode} onChange={(e) => setBgMode((e.target as any).value as BgMode)}>
                <SelectOption value="portrait">与立绘同步</SelectOption>
                <SelectOption value="custom">自行上传</SelectOption>
              </FilledSelect>
            </div>
            {bgMode === "portrait" && <p className="hint">与立绘同步：使用车卡页上传的立绘原图（非裁切版本）作为背景。</p>}
            {bgMode === "custom" && (
              <div className="settings-row">
                <span className="field-label">上传背景</span>
                <FilledButton onClick={() => bgFileRef.current?.click()}>选择图片</FilledButton>
                <input ref={bgFileRef} type="file" accept="image/*" onChange={onBgFile} style={{ display: "none" }} />
              </div>
            )}
            {bgMode === "custom" && <p className="hint">建议横向图片、比例约 16:9 为佳。</p>}
            <div className="settings-row">
              <span className="field-label">模糊强度</span>
              <Slider min={0} max={16} step={1} value={bgBlur} onInput={(e) => setBgBlur((e.target as any).value)} />
              <span className="label">{bgBlur}px</span>
            </div>
            <div className="settings-row">
              <span className="field-label">羽化强度</span>
              <Slider min={50} max={90} step={1} value={bgFeather} onInput={(e) => setBgFeather((e.target as any).value)} />
              <span className="label">{bgFeather}%</span>
            </div>
            <p className="hint">模糊：高斯模糊半径（0–16px，建议 0–8，过大会发白发糊）；羽化：底部渐隐区域占背景层高度的比例（最小 50%，S 曲线提前渐隐；图层外扩放大以避免白边）。</p>
          </>
        )}

      </section>

      <section className="block">
        <h3 className="block-title">感谢</h3>
        <div className="settings-row">
          <span className="field-label">数据支持</span>
          <a className="settings-link" href="https://4e-wiki.netlify.app/" target="_blank" rel="noreferrer">4e Wiki（现任维护者：风之守护）</a>
        </div>
      </section>

      <section className="block">
        <h3 className="block-title">源码仓库</h3>
        <div className="settings-row">
          <span className="field-label">地址</span>
          <a className="settings-link" href="https://github.com/NorthOpen/4E-NEXT" target="_blank" rel="noreferrer">github.com/NorthOpen/4E-NEXT</a>
        </div>
        <div className="settings-row">
          <span className="field-label">作者</span>
          <span className="label">KitaAkeru</span>
        </div>
      </section>
    </div>
  );
}
