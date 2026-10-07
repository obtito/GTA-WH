"""Photo-guided crown: four main slopes and four embedded hipped-gable bays.

Pure geometry; no bpy, fonts, materials, external files, or scene side effects.
Dimensions are an artistic fit to the supplied fifth-floor geometry, not a survey.
The two unverified elevations retain blank plaques.  See references/source-records.json.
"""
from math import cos, sin, pi, hypot


def _rotate(point, angle):
    x, y, z = point
    c, s = cos(angle), sin(angle)
    return (c*x-s*y, s*x+c*y, z)


def _surface(g, name, point, nu=24, nv=14, ribs=True, thickness=.13):
    """Closed roof shell; all upper faces wind upward, including rotated patches."""
    stride = nu+1
    top = [point(j/nu, i/nv) for i in range(nv+1) for j in range(nu+1)]
    faces = []
    for i in range(nv):
        for j in range(nu):
            a = i*stride+j
            face = (a, a+stride, a+stride+1, a+1)
            p, q, r = [top[k] for k in face[:3]]
            nz = (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
            faces.append(face if nz >= 0 else tuple(reversed(face)))
    count = len(top)
    lower = [(x, y, z-thickness) for x, y, z in top]
    underside = [tuple(k+count for k in reversed(f)) for f in faces]
    edges = {}
    for f in faces:
        for a, b in zip(f, f[1:]+f[:1]):
            key = (min(a,b), max(a,b))
            edges.setdefault(key, []).append((a,b))
    rim = [(a, a+count, b+count, b) for pairs in edges.values()
           if len(pairs) == 1 for a, b in pairs]
    g.poly(name+'/Glazed roof shell', top+lower, faces+underside+rim, 'tile')
    if ribs:
        for j in range(nu+1):
            line = [point(j/nu, i/nv) for i in range(nv+1)]
            g.tube(name+'/Round tile ribs', [(x,y,z+.037) for x,y,z in line],
                   .035, 'tilelight', sides=6)
        for i in range(2, nv, 3):
            line = [point(j/nu, i/nv) for j in range(nu+1)]
            g.tube(name+'/Tile overlaps', [(x,y,z+.024) for x,y,z in line],
                   .012, 'tileedge', sides=5)


def _eave(g, name, points):
    g.tube(name+'/Ceramic eave roll', points, .080, 'tilelight', sides=8)
    g.tube(name+'/Timber fascia', [(x,y,z-.13) for x,y,z in points],
           .090, 'darkwood', sides=8)
    g.tube(name+'/Painted soffit edge', [(x,y,z-.23) for x,y,z in points],
           .035, 'teal', sides=6)


def _short_kiss(g, name, position, direction):
    """A short ridge termination, continuous with the upturned roof itself."""
    x, y, z = position
    dx, dy = direction
    length = hypot(dx,dy)
    dx, dy = dx/length, dy/length
    path = [(x+dx*t, y+dy*t, z+.07+.20*(t/.22)**1.25)
            for t in (0,.055,.11,.165,.22)]
    g.tube(name+'/Short ridge kiss', path, .071, 'bronze', sides=8)


def _lathe(g, name, profile, material, sides=32):
    vertices = [(r*cos(2*pi*j/sides), r*sin(2*pi*j/sides), z)
                for z,r in profile for j in range(sides)]
    faces = [(i*sides+j, i*sides+(j+1)%sides,
              (i+1)*sides+(j+1)%sides, (i+1)*sides+j)
             for i in range(len(profile)-1) for j in range(sides)]
    faces += [tuple(reversed(range(sides))),
              tuple((len(profile)-1)*sides+j for j in range(sides))]
    g.poly(name, vertices, faces, material)


def build_crown_refined(g, z=24.2, half=5.4):
    """Build the complete crown and return oriented plaque lettering records.

    Plaque angle rotates the local front (-Y) to its cardinal elevation.  Text
    contains the visible left-to-right glyph sequence of the traditional plaque.
    """
    reach, peak, opening = half+1.30, z+5.0, 2.48
    inner, join = .12, half*.60
    crown = '06_Crown'

    def main_height(x, depth):
        t = (depth-inner)/(reach-inner)
        return z+5.0*(1-t)**1.43 + .60*(abs(x)/depth)**8*t**5

    # Each cardinal sector has a continuous upper slope and two outer wings.
    # The central opening is covered by the embedded bay; no roof buries its sign.
    for side in range(4):
        angle = side*pi/2
        name = crown+f'/Main slope {side+1}'
        def core(u,v,a=angle):
            d = inner+(join-inner)*v
            x = (2*u-1)*d
            return _rotate((x,-d,main_height(x,d)),a)
        _surface(g,name+'/Upper',core,nu=28,nv=15)
        for sign in (-1,1):
            def wing(u,v,sg=sign,a=angle):
                d = join+(reach-join)*v
                x = sg*(opening+(d-opening)*u)
                return _rotate((x,-d,main_height(x,d)),a)
            _surface(g,name+f'/Wing {sign}',wing,nu=18,nv=15)
            _eave(g,name,[wing(j/24,1) for j in range(25)])
        ridge = [_rotate((d,-d,main_height(d,d)+.055),angle)
                 for d in [inner+(reach-inner)*i/25 for i in range(26)]]
        g.tube(name+'/Main diagonal ridge',ridge,.105,'tilelight',sides=8)
        end = ridge[-1]
        _short_kiss(g,name,end,(end[0],end[1]))
    # Tiny square closure underneath the finial joins the four principal slopes.
    g.box(crown+'/Peak closure',(0,0,peak-.045),(.27,.27,.15),'tile')

    plaques = []
    for side in range(4):
        angle = side*pi/2
        name = crown+f'/Embedded bay {side+1}'
        project = lambda p,a=angle: _rotate(p,a)
        width, ridge_half = 2.58, 1.68
        ridge_y, front_y, back_y = -4.27, -(half+1.30), -3.06
        front_break, back_break = -5.13, -3.68
        ridge_z, front_z, back_z = z+3.0, z+1.45, z+2.34
        breaks = [(front_break,z+2.12,front_y,front_z),
                  (back_break,z+2.40,back_y,back_z)]
        for face,(yb,zb,ye,ze) in enumerate(breaks):
            def upper(u,v,yb=yb,zb=zb):
                return project(((2*u-1)*ridge_half,
                                ridge_y+(yb-ridge_y)*v,
                                ridge_z+(zb-ridge_z)*v**.86))
            def skirt(u,v,yb=yb,zb=zb,ye=ye,ze=ze):
                s = 2*u-1
                x = s*(ridge_half+(width-ridge_half)*v)
                return project((x,yb+(ye-yb)*v,
                                zb+(ze-zb)*v**.78+.47*abs(s)**7*v**4))
            _surface(g,name+f'/Upper pitch {face}',upper,nu=20,nv=8)
            _surface(g,name+f'/Lower pitch {face}',skirt,nu=28,nv=12)
            if face == 0:
                _eave(g,name,[skirt(j/32,1) for j in range(33)])
                for u,sg in ((0,-1),(1,1)):
                    _short_kiss(g,name,skirt(u,1),project((sg,-.32,0))[:2])
        for sign in (-1,1):
            def hip(u,v,sg=sign):
                yi = front_break+(back_break-front_break)*u
                yo = front_y+(back_y-front_y)*u
                zi = z+2.12+.28*u
                zo = front_z+(back_z-front_z)*u
                return project((sg*(ridge_half+(width-ridge_half)*v),
                                yi+(yo-yi)*v,zi+(zo-zi)*v**.78
                                +.47*abs(2*u-1)**7*v**4))
            _surface(g,name+f'/Side hip {sign}',hip,nu=17,nv=8)
            _eave(g,name,[hip(j/24,1) for j in range(25)])
            tri = [project((sign*ridge_half,y,h)) for y,h in
                   ((front_break,z+2.12),(back_break,z+2.40),(ridge_y,ridge_z))]
            g.poly(name+'/Recessed triangular gable',tri,
                   [(0,1,2) if sign>0 else (2,1,0)],'darkwood')
            for a,b in ((0,2),(2,1)):
                g.beam(name+'/Gable trim',tri[a],tri[b],.08,.08,'paint')
        g.tube(name+'/Horizontal ceramic ridge',
               [project((-ridge_half+.01,ridge_y,ridge_z+.045)),
                project((ridge_half-.01,ridge_y,ridge_z+.045))],
               .095,'tilelight',sides=8)
        # Only short extensions of the existing top-floor supports are modeled.
        for x in (-2.16,2.16):
            g.beam(name+'/Short supporting post',project((x,-half-.04,z-.45)),
                   project((x,-half-.04,z+1.28)),.19,.19,'red')
        g.box(name+'/Lintel',project((0,-half-.04,z+1.20)),
              (4.58,.25,.19),'red',rot=angle)
        center = project((0,-half-.16,z+.75))
        g.box(name+'/Plaque frame',center,(3.72,.18,1.09),'bronze',rot=angle)
        panel = project((0,-half-.27,z+.75))
        g.box(name+'/Plaque lacquer',panel,(3.54,.075,.91),'plaque',rot=angle)
        plaques.append({'center':project((0,-half-.325,z+.75)),
                        'width':3.35,'height':.78,'angle':angle,
                        'text':('樓鶴黃','目極天楚','','')[side]})

    profile = [(peak+dz,r) for dz,r in
               ((-.03,.28),(.03,.52),(.16,.50),(.28,.26),(.39,.22),
                (.51,.37),(.68,.45),(.84,.37),(.97,.20),(1.07,.13),
                (1.18,.23),(1.34,.25),(1.47,.15),(1.54,.09))]
    _lathe(g,crown+'/Finial bronze gourd',profile,'bronze')
    jewel = [(peak+1.65+.15*cos(pi-i*pi/16),
              max(.008,.145*sin(i*pi/16))) for i in range(17)]
    _lathe(g,crown+'/Finial red jewel',jewel,'jewel',sides=24)
    return plaques
