import { LEVELS, NOTE_HP, NOTE_REPLACE, NOTE_HUMAN_FEAT } from "./sheet/leveling";
import RulesQuickSearch from "./rules/RulesQuickSearch";

const FORMULAS: { title: string; rows: [string, string][] }[] = [
  {
    title: "派生数值",
    rows: [
      ["属性修正", "（属性值 − 10）÷ 2，向下取整"],
      ["半级", "等级 ÷ 2，向下取整"],
      ["生命上限", "职业起始 HP + 体质值 + 每级增加 HP ×（等级 − 1），1 级时不加每级 HP"],
      ["血值（重伤值）", "生命上限 ÷ 2，向下取整"],
      ["回复值", "生命上限 ÷ 4（向下取整），即每次花费一个回复力恢复的生命值"],
      ["每日回复力", "职业回复数 + 体质修正"],
      ["护甲等级 AC", "10 + 半级 + 护甲加值 + 盾牌加值（仅轻甲或无护甲时，再加最大（敏捷修正，智力修正））"],
      ["强韧", "10 + 半级 + 最大（力量，体质）修正 + 职业加值 + 种族加值 + 增强加值"],
      ["反射", "10 + 半级 + 最大（敏捷，智力）修正 + 盾牌加值 + 职业加值 + 种族加值 + 增强加值"],
      ["意志", "10 + 半级 + 最大（感知，魅力）修正 + 职业加值 + 种族加值 + 增强加值"],
      ["先攻", "敏捷修正 + 半级"],
      ["被动侦查 / 被动洞察", "10 + 感知修正 + 半级"],
    ],
  },
  {
    title: "技能检定",
    rows: [
      ["检定值", "关联属性修正 + 半级 + 受训 5"],
      ["受训", "每职业按规则选择指定数量的受训技能，受训加值 +5"],
    ],
  },
];

export default function LearnView() {
  return (
    <div className="learn-view">
      <section className="block">
        <h3 className="block-title">万律速查</h3>
        <RulesQuickSearch />
      </section>
      {FORMULAS.map((f) => (
        <section key={f.title} className="block">
          <h3 className="block-title">{f.title}</h3>
          <dl className="formula-list">
            {f.rows.map(([k, v]) => (
              <div key={k} className="formula-row"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>
      ))}
      <section className="block">
        <h3 className="block-title">行动点</h3>
        <div className="level-notes">
          <div>· 每个冒险者在开始时都有 1 个行动点。</div>
          <div>· 每完成一个里程碑（未进行长休息连续完成两场遭遇获胜），再获得 1 个行动点。</div>
          <div>· 冒险者每遭遇只能花费 1 个行动点。</div>
          <div>· 长休息结束时，失去所有未使用的行动点，但重新获得 1 个行动点。</div>
        </div>
      </section>
      <section className="block">
        <h3 className="block-title">22buy 购点法</h3>
        <p className="hint">起始属性数组：8、10、10、10、10、10，共 22 点可用于提升（种族加值不占购点）。花费表为「从 10 起的累计」：</p>
        <div className="level-table-wrap">
          <table className="level-table">
            <thead>
              <tr><th>属性值</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th><th>16</th><th>17</th><th>18</th></tr>
            </thead>
            <tbody>
              <tr><td>花费</td><td>-（1）</td><td>0（2）</td><td>1</td><td>2</td><td>3</td><td>5</td><td>7</td><td>9</td><td>12</td><td>16</td></tr>
            </tbody>
          </table>
        </div>
        <div className="level-notes">
          <div>· 如果属性值是 8：花费 1 点提升到 9，或花费 2 点提升到 10；必须先提升到 10 才能继续购买。</div>
          <div>· 已用购点 = Σ（各属性花费）− 10（起始数组基准），超过 22 视为超支。</div>
          <div>· 18 以上的属性只能通过升级获得（+1+1 / 全部 +1），购点不覆盖。</div>
          <div>· 常用预设（均为恰好 22 点）：16 16 12 11 11 8 · 16 16 12 10 10 10 · 18 14 11 10 10 8 · 18 12 12 10 10 10。</div>
        </div>
      </section>

      <section className="block">
        <h3 className="block-title">标准等级购物表</h3>
        
        <div className="level-table-wrap">
          <table className="level-table">
            <thead>
              <tr><th>Lv</th><th>物品价格</th><th>物品卖价</th><th>标准起始装备总值（装备+金币）</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>360</td><td>72</td><td>0+100</td></tr>
              <tr><td>2</td><td>520</td><td>104</td><td>1560+360</td></tr>
              <tr><td>3</td><td>680</td><td>136</td><td>2040+520</td></tr>
              <tr><td>4</td><td>840</td><td>168</td><td>2520+680</td></tr>
              <tr><td>5</td><td>1000</td><td>200</td><td>3640+840</td></tr>
              <tr><td>6</td><td>1800</td><td>360</td><td>5400+1000</td></tr>
              <tr><td>7</td><td>2600</td><td>520</td><td>7800+1800</td></tr>
              <tr><td>8</td><td>3400</td><td>680</td><td>10200+2600</td></tr>
              <tr><td>9</td><td>4200</td><td>840</td><td>12600+3400</td></tr>
              <tr><td>10</td><td>5000</td><td>1000</td><td>18200+4200</td></tr>
              <tr><td>11</td><td>9000</td><td>1800</td><td>27K+5K</td></tr>
              <tr><td>12</td><td>13000</td><td>2600</td><td>39K+9K</td></tr>
              <tr><td>13</td><td>17000</td><td>3400</td><td>51K+13K</td></tr>
              <tr><td>14</td><td>21000</td><td>4200</td><td>63K+17K</td></tr>
              <tr><td>15</td><td>25000</td><td>5000</td><td>91K+21K</td></tr>
              <tr><td>16</td><td>45000</td><td>9000</td><td>135K+25K</td></tr>
              <tr><td>17</td><td>65000</td><td>13000</td><td>195K+45K</td></tr>
              <tr><td>18</td><td>85000</td><td>17000</td><td>255K+65K</td></tr>
              <tr><td>19</td><td>105K</td><td>21K</td><td>315K+85K</td></tr>
              <tr><td>20</td><td>125K</td><td>25K</td><td>455K+105K</td></tr>
              <tr><td>21</td><td>225K</td><td>45K</td><td>675K+125K</td></tr>
              <tr><td>22</td><td>325K</td><td>65K</td><td>975K+225K</td></tr>
              <tr><td>23</td><td>425K</td><td>85K</td><td>1275K+325K</td></tr>
              <tr><td>24</td><td>525K</td><td>105K</td><td>1575K+425K</td></tr>
              <tr><td>25</td><td>625K</td><td>125K</td><td>2275K+525K</td></tr>
              <tr><td>26</td><td>1125K</td><td>225K</td><td>3375K+625K</td></tr>
              <tr><td>27</td><td>1625K</td><td>325K</td><td>4875K+1125K</td></tr>
              <tr><td>28</td><td>2125K</td><td>425K</td><td>6375K+1625K</td></tr>
              <tr><td>29</td><td>2625K</td><td>525K</td><td>7875K+2125K</td></tr>
              <tr><td>30</td><td>3125K</td><td>625K</td><td>9375K+2625K</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="block">
        <h3 className="block-title">尚未计入的加值</h3>
        <p className="hint">属性修正、护甲/盾牌加值、职业/种族加值与魔法物品增强加值均已计入上述派生数值；暂时未能自动计入的仅剩来自状态、专长等临时性质的「其他加值或减值」。</p>
      </section>
      <section className="block">
        <h3 className="block-title">升级信息</h3>
        <p className="hint">下表为官方 30 级升级表：每等级所需 XP 总值、属性成长、已知专长数与已知威能合计（随意/遭遇/每日/辅助）。</p>
        <div className="level-table-wrap">
          <table className="level-table">
            <thead>
              <tr><th>等级</th><th>XP 总值</th><th>属性成长</th><th>专长</th><th>随意</th><th>遭遇</th><th>每日</th><th>辅助</th></tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l.level}>
                  <td>{l.level}</td>
                  <td>{l.xp.toLocaleString("zh-CN")}</td>
                  <td>{l.abilityBoost}</td>
                  <td>{l.feats}</td>
                  <td>{l.powers.atWill}</td>
                  <td>{l.powers.encounter}</td>
                  <td>{l.powers.daily}</td>
                  <td>{l.powers.utility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="level-notes">
          <div>· {NOTE_HP}</div>
          <div>· {NOTE_REPLACE}</div>
          <div>· {NOTE_HUMAN_FEAT}</div>
        </div>
      </section>
    </div>
  );
}