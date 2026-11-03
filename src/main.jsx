import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Play, Plus, Users, MessageCircle, Link2, Search, Bell, Settings, Send, Copy, Check, X, ChevronRight, Menu, LogOut, Clapperboard, DoorOpen, Film, LoaderCircle } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('Phòng của tôi');
  const [query, setQuery] = useState('');
  const [roomName, setRoomName] = useState('Movie night của tụi mình');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [nav, setNav] = useState(false);

  const user = session?.user;
  const activeRoom = rooms.find((room) => room.id === activeId) || null;
  const filteredRooms = useMemo(() => rooms.filter((room) => {
    const text = (room.name + ' ' + room.invite_code).toLowerCase();
    return text.includes(query.toLowerCase());
  }), [rooms, query]);

  const loadRooms = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error: loadError } = await supabase.from('rooms').select('*').order('created_at', { ascending: false });
    if (loadError) { setError(loadError.message); return; }
    setRooms(data || []);
    setActiveId((current) => current && data?.some((room) => room.id === current) ? current : data?.[0]?.id || null);
  }, [user]);

  const loadRoomDetails = useCallback(async (roomId) => {
    if (!roomId || !supabase) { setMembers([]); setMessages([]); return; }
    const [{ data: memberRows, error: memberError }, { data: messageRows, error: messageError }] = await Promise.all([
      supabase.from('room_members').select('user_id, role, joined_at').eq('room_id', roomId).order('joined_at'),
      supabase.from('messages').select('id, user_id, body, created_at').eq('room_id', roomId).order('created_at').limit(100)
    ]);
    if (memberError) setError(memberError.message);
    if (messageError) setError(messageError.message);
    const ids = [...new Set([...(memberRows || []).map((row) => row.user_id), ...(messageRows || []).map((row) => row.user_id)])];
    let profiles = [];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      profiles = data || [];
    }
    const names = Object.fromEntries(profiles.map((item) => [item.id, item.display_name]));
    setMembers((memberRows || []).map((row) => ({ ...row, display_name: names[row.user_id] || 'Thành viên' })));
    setMessages((messageRows || []).map((row) => ({ ...row, display_name: names[row.user_id] || 'Thành viên' })));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) { setProfile(null); setRooms([]); setActiveId(null); return; }
    let cancelled = false;
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (!cancelled) setProfile(data || { display_name: user.user_metadata?.display_name || user.email?.split('@')[0] });
    });
    loadRooms();
    return () => { cancelled = true; };
  }, [user?.id, loadRooms]);

  useEffect(() => { loadRoomDetails(activeId); }, [activeId, loadRoomDetails]);

  useEffect(() => {
    if (!activeId || !supabase) return;
    const channel = supabase.channel('room-live-' + activeId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'room_id=eq.' + activeId }, () => loadRoomDetails(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + activeId }, () => loadRoomDetails(activeId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadRoomDetails]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const authenticate = async (event) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setError('');
    try {
      if (authMode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email, password, options: { data: { display_name: displayName.trim() || email.split('@')[0] } }
        });
        if (authError) throw authError;
        if (data.session) setNotice('Tài khoản đã được tạo.');
        else setNotice('Kiểm tra email để xác nhận tài khoản trước khi đăng nhập.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (e) { setError(e.message || 'Không thể xác thực tài khoản.'); }
    finally { setAuthBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setRooms([]); setProfile(null); };

  const createRoom = async (event) => {
    event?.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true); setError('');
    const { data, error: createError } = await supabase.rpc('create_room', { room_name: roomName.trim() });
    if (createError) setError(createError.message);
    else { setModal(''); setRoomName('Movie night của tụi mình'); await loadRooms(); setActiveId(data.id); setNotice('Đã tạo phòng. Chia sẻ mã mời với bạn bè nhé!'); }
    setBusy(false);
  };

  const joinRoom = async (event) => {
    event?.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true); setError('');
    const { data, error: joinError } = await supabase.rpc('join_room', { code: joinCode.trim() });
    if (joinError) setError(joinError.message);
    else { setJoinCode(''); setModal(''); await loadRooms(); setActiveId(data.id); setNotice('Bạn đã tham gia phòng.'); }
    setBusy(false);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const body = message.trim();
    if (!body || !activeId || !user) return;
    setMessage('');
    const { error: sendError } = await supabase.from('messages').insert({ room_id: activeId, user_id: user.id, body });
    if (sendError) { setMessage(body); setError(sendError.message); }
  };

  const leaveRoom = async () => {
    if (!activeRoom || !user) return;
    if (activeRoom.host_id === user.id) {
      setError('Chủ phòng chưa thể rời phòng. Hãy kết thúc phòng hoặc chuyển quyền chủ phòng trước.');
      return;
    }
    const { error: leaveError } = await supabase.from('room_members').delete().eq('room_id', activeRoom.id).eq('user_id', user.id);
    if (leaveError) setError(leaveError.message);
    else { setActiveId(null); await loadRooms(); setNotice('Đã rời phòng.'); }
  };

  const copyInvite = async () => {
    if (!activeRoom) return;
    const inviteUrl = window.location.origin + '/?join=' + activeRoom.invite_code;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setNotice('Đã sao chép link mời.'); setTimeout(() => setCopied(false), 1800); }
    catch { setNotice('Mã mời: ' + activeRoom.invite_code); }
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (code && user) { setJoinCode(code); setModal('join'); }
  }, [user?.id]);

  if (!supabase) return <div className="auth-screen"><div className="auth-card"><Brand/><h1>Chưa cấu hình kết nối</h1><p>Thiếu biến môi trường Supabase. Hãy thêm VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY trong cấu hình Vercel rồi build lại.</p></div></div>;

  if (!session) return <div className="auth-screen"><form className="auth-card" onSubmit={authenticate}><Brand/><small className="eyebrow">YOUR CINEMA, YOUR PEOPLE</small><h1>{authMode === 'login' ? 'Chào mừng trở lại.' : 'Tạo tài khoản.'}</h1><p>{authMode === 'login' ? 'Đăng nhập để tiếp tục những đêm phim cùng bạn bè.' : 'Đăng ký để tạo phòng và mời bạn bè cùng xem.'}</p>
    {authMode === 'signup' && <label>Tên hiển thị<input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tên của bạn"/></label>}
    <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label>
    <label>Mật khẩu<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự"/></label>
    {error && <p className="error">{error}</p>}{notice && <p className="notice">{notice}</p>}
    <button className="primary full" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin"/> : null}{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} <ChevronRight/></button>
    <button type="button" className="auth-switch" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError(''); }}>{authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button>
  </form></div>;

  return <div className="shell">
    <aside className={'sidebar ' + (nav ? 'open' : '')}><Brand/><div className="workspace"><b>{(profile?.display_name || 'W').slice(0,1).toUpperCase()}</b><div>{profile?.display_name || 'Workspace cá nhân'}<small>{user.email}</small></div></div><label>MENU CHÍNH</label>
      {['Phòng của tôi','Tham gia phòng'].map((item) => <button key={item} className={'nav ' + (tab === item ? 'active' : '')} onClick={() => { setTab(item); setNav(false); if (item === 'Tham gia phòng') setModal('join'); }}>{item === 'Phòng của tôi' ? <Film/> : <DoorOpen/>}{item}</button>)}
      <label className="space-label">PHÒNG ĐÃ THAM GIA</label>{rooms.slice(0,5).map((room) => <button key={room.id} className="side-room-btn" onClick={() => setActiveId(room.id)}>◉　{room.name}</button>)}
      <div className="side-bottom"><div className="upgrade"><Clapperboard/><b>Đêm phim bắt đầu từ đây</b><p>Tạo phòng riêng và mời bạn bè bằng một đường link.</p><a onClick={() => setModal('create')}>Tạo phòng mới →</a></div><div className="profile"><b>{(profile?.display_name || 'U').slice(0,1).toUpperCase()}</b><div>{profile?.display_name || 'Thành viên'}<small>Đã đăng nhập</small></div><button onClick={signOut} title="Đăng xuất"><LogOut/></button></div></div>
    </aside>
    <main><header><button className="hamb" onClick={() => setNav(!nav)}><Menu/></button><div className="crumb">Workspace　/　<strong>{tab}</strong></div><div className="head-right"><span>Đã kết nối tài khoản</span><Bell/><b className="user">{(profile?.display_name || 'U').slice(0,1).toUpperCase()}</b></div></header>
      <div className="content"><section className="hero"><div><small className="eyebrow">✦ YOUR CINEMA, YOUR PEOPLE</small><h1>Phim hay hơn khi<br/><em>xem cùng nhau.</em></h1><p>Tạo không gian riêng, mời hội bạn và cùng tận hưởng từng khoảnh khắc.</p><div className="actions"><button className="primary" onClick={() => setModal('create')}><Plus/> Tạo phòng xem</button><button className="secondary" onClick={() => setModal('join')}><Link2/> Tham gia bằng mã</button></div></div><div className="hero-art"><div className="orbit"></div><div className="screen"><Play fill="currentColor"/><small>YOUR MOVIE NIGHT</small></div><span className="float one">🔒 Phòng riêng tư</span><span className="float two">✦ Cùng bạn bè</span><i>✦</i></div></section>
      <section className="stats"><div><Users/><b>{rooms.length}</b><small>Phòng của bạn</small></div><div><MessageCircle/><b>{members.length}</b><small>Thành viên phòng đang mở</small></div><div><Film/><b>{messages.length}</b><small>Tin nhắn gần đây</small></div><small className="community">Dữ liệu trực tiếp từ WATCH//PARTY</small></section>
      <section className="rooms"><div className="section-head"><div><small className="eyebrow">YOUR WATCH SPACES</small><h2>Phòng của bạn <sup>{filteredRooms.length}</sup></h2></div><div className="tools"><div className="search"><Search/><input placeholder="Tìm phòng..." value={query} onChange={(e) => setQuery(e.target.value)}/></div></div></div>
        {filteredRooms.length ? <div className="grid">{filteredRooms.map((room) => <article className="card" key={room.id}><div className="poster"><div className="poster-head"><small className="wait">● PHÒNG RIÊNG</small><span>···</span></div><div className="art-title">{room.name}</div><div className="poster-foot">WATCH//PARTY　✦</div></div><div className="card-info"><div className="card-title"><div><b>{room.name}</b><small>Mã mời: {room.invite_code}</small></div><span className="faces">🔒</span></div><div className="card-foot"><small>{room.status === 'watching' ? 'Đang xem' : 'Đang chờ'}</small><button onClick={() => setActiveId(room.id)}>Mở phòng <ChevronRight/></button></div></div></article>)}</div> : <div className="empty-state"><div><Film/></div><h3>Chưa có phòng nào</h3><p>Tạo phòng xem đầu tiên hoặc nhập mã mời để tham gia cùng bạn bè. Phòng và tin nhắn sẽ được lưu thật trên tài khoản của bạn.</p><div><button className="primary" onClick={() => setModal('create')}><Plus/> Tạo phòng</button><button className="secondary" onClick={() => setModal('join')}><Link2/> Nhập mã mời</button></div></div>}
      </section><footer>© 2026 WATCH//PARTY <span>Made for movie nights ✦</span><span>Dữ liệu được lưu trên Supabase</span></footer></div></main>
    <aside className="right"><div className="right-title"><div><small className="eyebrow">YOUR CURRENT ROOM</small><h3>Phòng đang mở</h3></div><Settings/></div>
      {activeRoom ? <><div className="room-cover"><Play fill="currentColor"/><b>WATCH<br/>TOGETHER</b></div><b className="room-name">{activeRoom.name}</b><small className="room-status">● {activeRoom.status === 'watching' ? 'Đang xem' : 'Đang chờ'}</small><div className="room-id">MÃ MỜI　<strong>{activeRoom.invite_code}</strong><button onClick={copyInvite}>{copied ? <Check/> : <Copy/>}</button></div><button className="share" onClick={copyInvite}><Link2/> {copied ? 'Đã sao chép link' : 'Chia sẻ lời mời'}</button><hr/><div className="members-title">Thành viên <b>{members.length}</b><a onClick={copyInvite}>Mời bạn +</a></div>
      <div className="member-list">{members.map((member) => <div className="member" key={member.user_id}><b className="face">{(member.display_name || 'U').slice(0,1).toUpperCase()}</b><div>{member.display_name}<small>{member.role === 'host' ? 'Chủ phòng' : 'Thành viên'}</small></div>{member.role === 'host' && <small className="host">HOST</small>}</div>)}</div>
      <hr/><div className="chat-title"><b><MessageCircle/> Trò chuyện</b><small>LIVE</small></div><div className="chat">{messages.map((item) => <div className={item.user_id === user.id ? 'mine' : ''} key={item.id}><small><b>{item.display_name}</b>　{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small><p>{item.body}</p></div>)}{!messages.length && <p className="chat-empty">Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!</p>}</div><form className="chat-box" onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi tin nhắn..."/><button><Send/></button></form><button className="leave-room" onClick={leaveRoom}>Rời phòng</button></> : <div className="room-empty"><div><Film/></div><h3>Chưa chọn phòng</h3><p>Tạo phòng mới hoặc tham gia phòng bằng mã mời để bắt đầu trò chuyện.</p><button className="primary full" onClick={() => setModal('create')}><Plus/> Tạo phòng xem</button><button className="secondary full" onClick={() => setModal('join')}><Link2/> Tham gia phòng</button></div>}
    </aside>
    {error && <div className="toast error-toast">{error}<button onClick={() => setError('')}><X/></button></div>}{notice && <div className="toast">{notice}</div>}
    {modal && <div className="overlay" onClick={() => setModal('')}><form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={modal === 'create' ? createRoom : joinRoom}><button type="button" className="close" onClick={() => setModal('')}><X/></button><div className="dialog-icon">{modal === 'create' ? <Clapperboard/> : <DoorOpen/>}</div><small className="eyebrow">{modal === 'create' ? 'START A MOVIE NIGHT' : 'JOIN YOUR FRIENDS'}</small><h2>{modal === 'create' ? 'Tạo phòng xem mới' : 'Tham gia phòng'}</h2><p>{modal === 'create' ? 'Một không gian riêng cho bạn và những người bạn yêu quý.' : 'Nhập mã mời bạn nhận được từ chủ phòng.'}</p>
      {modal === 'create' ? <><label>Tên phòng<input maxLength={80} required value={roomName} onChange={(e) => setRoomName(e.target.value)}/></label><div className="privacy">🔒　Phòng riêng tư<small>Chỉ người có mã mời mới tham gia được.</small></div></> : <label>Mã mời<input required autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Ví dụ: A1B2C3D4"/></label>}
      <button className="primary full" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : null}{modal === 'create' ? 'Tạo phòng' : 'Tham gia phòng'} <ChevronRight/></button></form></div>}
  </div>;
}

function Brand() { return <div className="brand"><i><Play size={15} fill="currentColor"/></i>WATCH<span>//</span>PARTY</div>; }
createRoot(document.getElementById('root')).render(<App/>);
