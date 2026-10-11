const {Plugin,ItemView,Modal,Setting,Notice}=require('obsidian');
const VIEW='exam-evidence-timeline';
function parseTime(raw,precision){
  if(precision==='未知')return null;
  const pattern={年:/^(-?\d{1,6})$/,月:/^(-?\d{1,6})-(\d{2})$/,日:/^(-?\d{1,6})-(\d{2})-(\d{2})$/}[precision];
  const match=pattern?.exec(String(raw).trim());if(!match)throw Error('时间与精度不一致：年填 1949，月填 1949-10，日填 1949-10-01；公元前年份用负数。');
  const year=Number(match[1]),month=Number(match[2]||1),day=Number(match[3]||1);
  if(year===0||month<1||month>12)throw Error('年份不能为 0，月份需为 01–12。');
  const leap=year%4===0&&(year%100!==0||year%400===0);const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(day<1||day>days[month-1])throw Error('日期无效。');return {year,month,day};
}
function compareEvents(a,b){const x=parseTime(a.time_start,a.time_precision),y=parseTime(b.time_start,b.time_precision);if(!x)return y?1:0;if(!y)return -1;return x.year-y.year||x.month-y.month||x.day-y.day;}
function eventDocument(value){const fm={note_type:'timeline_event',event_id:globalThis.crypto.randomUUID(),...value,created_at:new Date().toISOString()};return '---\n'+Object.entries(fm).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n# '+value.title+'\n\n## 来源与依据\n'+(value.source_note?'[['+value.source_note+']]':'待补充')+'\n\n## 关联实体\n'+(value.entity_note?'[['+value.entity_note+']]':'待关联')+'\n\n## 争议与解释\n'+(value.dispute||'待补充')+'\n';}
class EventModal extends Modal{
  constructor(app,plugin){super(app);this.plugin=plugin;this.value={title:'',time_start:'',time_end:'',time_precision:'年',time_expression:'',event_kind:'事件发生',topic:'',source_note:'',source_locator:'',entity_note:'',verification_status:'待核验',dispute:''};}
  onOpen(){const el=this.contentEl;el.createEl('h2',{text:'记录事件时间'});el.createEl('p',{text:'按来源实际精度填写，未知日期不补成精确日期。记录可以关联现有词典实体。'});
    for(const [key,label]of [['title','名称'],['time_start','开始时间'],['time_end','结束时间（可选）'],['time_expression','来源原始时间表达'],['topic','专题（党史、政治理论等）'],['source_note','来源文件路径'],['source_locator','页码 / 区块 / 版本依据'],['entity_note','关联实体 MD 路径'],['dispute','争议与说明']])new Setting(el).setName(label).addText(t=>t.onChange(v=>this.value[key]=v));
    for(const [key,label,options]of [['time_precision','时间精度',['年','月','日','未知']],['event_kind','时间含义',['事件发生','创作','发明','最早记载','传播']],['verification_status','核验状态',['待核验','部分核验','已核验','存在争议']]])new Setting(el).setName(label).addDropdown(d=>{options.forEach(v=>d.addOption(v,v));d.setValue(this.value[key]).onChange(v=>this.value[key]=v);});
    new Setting(el).addButton(b=>b.setButtonText('保存事件').setCta().onClick(async()=>{b.setDisabled(true);try{await this.plugin.createEvent(this.value);this.close();}catch(e){new Notice(e.message,7000);b.setDisabled(false);}}));
  }
}
class TimelineView extends ItemView{
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.topic='';}
  getViewType(){return VIEW;}getDisplayText(){return '证据时间轴';}getIcon(){return 'calendar-range';}
  onOpen(){this.render();}
  render(){const el=this.contentEl;el.empty();el.addClass('evidence-timeline');el.createEl('h2',{text:'证据时间轴'});el.createEl('p',{text:'先看时间依据，再看事件顺序。不同含义的时间保留独立记录。',cls:'timeline-muted'});new Setting(el).setName('新增记录').addButton(b=>b.setButtonText('记录事件').setCta().onClick(()=>new EventModal(this.app,this.plugin).open()));new Setting(el).setName('专题筛选').addText(t=>t.setValue(this.topic).onChange(v=>{this.topic=v;this.renderRows();}));this.rows=el.createDiv();this.renderRows();}
  renderRows(){if(!this.rows)return;this.rows.empty();const events=this.plugin.events().filter(x=>!this.topic||String(x.fm.topic||'').includes(this.topic));events.sort((a,b)=>{try{return compareEvents(a.fm,b.fm);}catch{return 0;}});if(!events.length)this.rows.createEl('p',{text:'没有事件。创建记录，或给已有 Markdown 添加 note_type: timeline_event。'});
    for(const event of events){const row=this.rows.createDiv({cls:'timeline-row'});let valid=true;try{parseTime(event.fm.time_start,event.fm.time_precision);}catch{valid=false;}row.createEl('strong',{text:valid?(event.fm.time_precision==='未知'?'时间未知':String(event.fm.time_start||'时间未知')):'时间格式待核对'});const button=row.createEl('button',{text:event.file.basename});button.onclick=()=>this.app.workspace.openLinkText(event.file.path,'','tab');row.createSpan({text:[event.fm.time_precision,event.fm.event_kind,event.fm.topic,event.fm.verification_status].filter(Boolean).join(' · '),cls:'timeline-muted'});if(event.fm.time_end)row.createEl('p',{text:'结束：'+event.fm.time_end});if(event.fm.time_expression)row.createEl('p',{text:'原始表达：'+event.fm.time_expression});if(event.fm.source_locator)row.createEl('p',{text:'定位依据：'+event.fm.source_locator});if(event.fm.dispute)row.createEl('p',{text:'争议：'+event.fm.dispute});}
  }
}
class Timeline extends Plugin{
  async onload(){this.registerView(VIEW,l=>new TimelineView(l,this));this.addRibbonIcon('calendar-range','证据时间轴',()=>this.open());this.addCommand({id:'open',name:'打开证据时间轴',callback:()=>this.open()});this.registerEvent(this.app.metadataCache.on('changed',()=>{for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.renderRows();}));}
  events(){return this.app.vault.getMarkdownFiles().map(file=>({file,fm:this.app.metadataCache.getFileCache(file)?.frontmatter||{}})).filter(x=>x.fm.note_type==='timeline_event');}
  async createEvent(value){const title=value.title.trim();if(!title)throw Error('请填写名称。');const start=parseTime(value.time_start,value.time_precision);if(value.time_end){const end=parseTime(value.time_end,value.time_precision);if(!start||!end)throw Error('未知精度不能填写结束时间。');if(compareEvents({time_start:value.time_start,time_precision:value.time_precision},{time_start:value.time_end,time_precision:value.time_precision})>0)throw Error('结束时间不能早于开始时间。');}for(const key of ['source_note','entity_note'])if(value[key]&&!this.app.vault.getAbstractFileByPath(value[key]))throw Error('文件路径不存在：'+value[key]);const folder='证据时间轴';if(!await this.app.vault.adapter.exists(folder))await this.app.vault.createFolder(folder);const name=title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/[. ]+$/,'').slice(0,100)||'事件';await this.app.vault.create(`${folder}/${name}-${globalThis.crypto.randomUUID().slice(0,8)}.md`,eventDocument({...value,title}));new Notice('事件已保存。');}
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
  onunload(){this.app.workspace.detachLeavesOfType(VIEW);}
}
module.exports=Timeline;module.exports.__test={parseTime,compareEvents,eventDocument};
