"""Reference-guided facade geometry, isolated from the preserved V1 model.

The four projecting halls and three principal bays follow the visible Xinhua
reference. Exact dimensions, concealed elevations and joinery remain inferred.
Only the caller's deterministic geometry interface is used; no bpy dependency.
"""

from math import atan2, hypot


def _ring(half, inset=0.0):
    """Twenty CCW vertices; positive inset is a true orthogonal inward offset."""
    r, s, a = half-inset, half*.90-inset, half*.53-inset
    quarter = [(-a, -r), (a, -r), (a, -s), (s, -s), (s, -a)]
    points = []
    for turn in range(4):
        for x, y in quarter:
            for _ in range(turn):
                x, y = -y, x
            points.append((x, y))
    return points


def _frame(p, q):
    dx, dy = q[0]-p[0], q[1]-p[1]
    length = hypot(dx, dy)
    t = (dx/length, dy/length)
    return length, t, (-t[1], t[0]), atan2(dy, dx)


def _at(p, t, n, x, inset, z):
    return (p[0]+t[0]*x+n[0]*inset,
            p[1]+t[1]*x+n[1]*inset, z)


def _prism(g, name, ring, bottom, top, mat):
    # A center fan explicitly triangulates the star-shaped concave plan.
    count = len(ring)
    verts = [(x, y, bottom) for x, y in ring]
    verts += [(x, y, top) for x, y in ring]
    verts += [(0, 0, bottom), (0, 0, top)]
    faces = []
    for i in range(count):
        j = (i+1) % count
        faces.extend([(count*2, j, i), (count*2+1, i+count, j+count),
                      (i, j, j+count, i+count)])
    g.poly(name, verts, faces, mat)


def _rail(g, prefix, p, q, z, front_entrance=False):
    """The previous white-stone treatment, retained for comparison stages."""
    length, t, n, angle = _frame(p, q)
    bays = max(1, round(length/1.35))
    if front_entrance:
        bays = max(5, bays)
        bays += int(bays % 2 == 0)
    gap_bay = bays//2 if front_entrance else -1
    post_positions = set()
    for bay in range(bays):
        if bay == gap_bay:
            continue
        x0, x1 = length*bay/bays, length*(bay+1)/bays
        post_positions.update((bay, bay+1))
        center, span = (x0+x1)/2, x1-x0
        for dz, thick in ((.20, .105), (.76, .105), (.91, .13)):
            g.box(prefix+"_rail_beams", _at(p, t, n, center, 0, z+dz),
                  (span, .115, thick), "stone", rot=angle)
        for j in range(1, 4):
            g.box(prefix+"_rail_balusters", _at(p, t, n, x0+span*j/4, 0, z+.48),
                  (.072, .083, .49), "stone", rot=angle)
    for index in sorted(post_positions):
        x = length*index/bays
        g.box(prefix+"_rail_posts", _at(p, t, n, x, 0, z+.50),
              (.16, .16, 1.0), "stone", rot=angle)
        g.box(prefix+"_rail_caps", _at(p, t, n, x, 0, z+1.035),
              (.215, .215, .085), "stone", rot=angle)


def _rail_connector(g, prefix, p, q, z, refined):
    """Short returns receive plain rails, never a squeezed ornamental panel."""
    length, t, n, angle = _frame(p, q)
    mat = "red" if refined else "stone"
    for dz, thick in ((.14, .11), (.83, .105), (.96, .13)):
        g.box(prefix+"_rail_return_beams", _at(p, t, n, length/2, 0, z+dz),
              (length, .13, thick), mat, rot=angle)


def _wood_rail(g, prefix, p, q, z):
    """Dense square-return fretwork, built from solid wood strips."""
    length, t, n, angle = _frame(p, q)
    for dz, thick in ((.13, .12), (.81, .10), (.94, .12)):
        g.box(prefix+"_rail_beams", _at(p, t, n, length/2, 0, z+dz),
              (length, .135, thick), "red", rot=angle)
    cells = max(1, round(length/.46))
    pitch = length/cells
    width = min(.39, pitch-.06)
    # Paired rectangular rings make repeated, readable 回 motifs.
    for cell in range(cells):
        x = (cell+.5)*pitch
        for w, h, mat, thick in ((width, .49, "red", .041),
                                  (width*.45, .235, "darkwood", .034)):
            for xx in (x-w/2, x+w/2):
                g.box(prefix+"_rail_fretwork", _at(p, t, n, xx, 0, z+.46),
                      (thick, .075, h), mat, rot=angle)
            for zz in (z+.46-h/2, z+.46+h/2):
                g.box(prefix+"_rail_fretwork", _at(p, t, n, x, 0, zz),
                      (w+thick, .075, thick), mat, rot=angle)
        g.box(prefix+"_rail_fret_links", _at(p, t, n, x, 0, z+.73),
              (.04, .075, .13), "red", rot=angle)
        g.box(prefix+"_rail_fret_links", _at(p, t, n, x, 0, z+.19),
              (.04, .075, .08), "red", rot=angle)
    bays = max(1, round(length/1.65))
    for index in range(bays+1):
        x = length*index/bays
        g.box(prefix+"_rail_posts", _at(p, t, n, x, 0, z+.52),
              (.13, .14, 1.04), "red", rot=angle)
        g.box(prefix+"_rail_caps", _at(p, t, n, x, 0, z+1.045),
              (.18, .19, .075), "darkwood", rot=angle)


def _queti(g, prefix, p, t, n, station, sign, z, length):
    """Solid curved knee bracket: a shaped profile extruded 0.18 m thick."""
    reach = min(.72, length*.30)
    profile = [(0, 0), (1, 0), (.98, -.06), (.76, -.10),
               (.53, -.18), (.32, -.31), (.16, -.44), (0, -.48)]
    points = [(station+sign*x*reach, z+zz) for x, zz in profile]
    # Positive profile orientation in local x/z gives the front/outward face.
    area = sum(points[i][0]*points[(i+1)%len(points)][1]
               - points[(i+1)%len(points)][0]*points[i][1]
               for i in range(len(points)))
    if area < 0:
        points.reverse()
    count = len(points)
    verts = [_at(p, t, n, x, -.09, zz) for x, zz in points]
    verts += [_at(p, t, n, x, .09, zz) for x, zz in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, count*2)))]
    faces += [((i+1)%count, i, i+count, (i+1)%count+count) for i in range(count)]
    g.poly(prefix+"_curved_queti", verts, faces, "red")


def _lattice_window(g, prefix, p, t, n, angle, center, width, bottom, top):
    middle, height = (bottom+top)/2, top-bottom
    g.box(prefix+"_window_infill", _at(p, t, n, center, .025, middle),
          (width, .07, height), "window", rot=angle)
    for x in (center-width/2, center+width/2):
        g.box(prefix+"_window_frames", _at(p, t, n, x, -.045, middle),
              (.095, .10, height+.08), "darkwood", rot=angle)
    for zz in (bottom, top):
        g.box(prefix+"_window_frames", _at(p, t, n, center, -.05, zz),
              (width+.10, .11, .09), "darkwood", rot=angle)
    for j in range(1, 5):
        g.box(prefix+"_window_lattice", _at(p, t, n, center-width/2+width*j/5,
                                          -.08, middle),
              (.034, .055, height), "darkwood", rot=angle)
    for j in range(1, 5):
        g.box(prefix+"_window_lattice", _at(p, t, n, center, -.087,
                                          bottom+height*j/5),
              (width, .055, .035), "darkwood", rot=angle)
    g.box(prefix+"_window_sills", _at(p, t, n, center, -.10, bottom-.065),
          (width+.15, .21, .09), "darkwood", rot=angle)


def build_floor(g, level: int, z: float, half: float, height: float, refined=True):
    """One projecting-hall storey; refined=False retains white rail comparison."""
    prefix = "Floor_%02d" % level
    is_ground = level == 1
    outer, inner = _ring(half), _ring(half, inset=1.15)
    railing = _ring(half, inset=-.18)
    slab_mat = "red" if refined and not is_ground else "stone"
    _prism(g, prefix+"_balcony_slab", _ring(half, inset=-.32), z-.24, z, slab_mat)
    _prism(g, prefix+"_floor_edge", _ring(half, inset=-.35), z-.30, z-.22, "darkwood")
    column_radius = min(.18, max(.15, half*.026))

    for side in range(20):
        p, q = outer[side], outer[(side+1)%20]
        length, t, n, angle = _frame(p, q)
        kind = side % 5
        short_return = kind in (1, 4)
        bays = 3 if kind == 0 else 1
        bay_width = length/bays

        # Four columns across each three-bay projection, plus one square corner.
        # No additional columns are squeezed into the short recessed returns.
        if kind == 0:
            stations = [i*bay_width for i in range(bays+1)]
        elif kind == 2:
            stations = [length]
        else:
            stations = []
        for x in stations:
            point = _at(p, t, n, x, 0, z)
            g.cylinder(prefix+"_column_bases", (point[0], point[1], z+.11),
                       column_radius*1.30, .22, "stone", sides=12)
            g.cylinder(prefix+"_vermilion_columns",
                       (point[0], point[1], z+.20+(height-.46)/2),
                       column_radius, height-.46, "red", sides=16)
            g.cylinder(prefix+"_column_neck_rings",
                       (point[0], point[1], z+height-.34),
                       column_radius*1.075, .065, "darkwood", sides=12)
            for tier, width in enumerate((.38, .54)):
                zz = z+height-.42+tier*.14
                g.box(prefix+"_bracket_blocks", _at(p, t, n, x, 0, zz),
                      (width, .24, .105), "red", rot=angle)
                g.box(prefix+"_bracket_arms", _at(p, t, n, x, 0, zz+.055),
                      (.20, width*.85, .085), "darkwood", rot=angle)

        # Short returns have only the same simple structural connecting beams.
        for zz, sy, sz, mat, tag in (
                (z+height-.26, .34, .30, "red", "structural_beams"),
                (z+height-.085, .37, .12, "cream", "painted_fascia"),
                (z+height-.175, .38, .035, "darkwood", "fascia_edges")):
            g.box(prefix+"_"+tag, _at(p, t, n, length/2, 0, zz),
                  (length+.01, sy, sz), mat, rot=angle)
        if not short_return:
            knees = stations if kind != 3 else [0.0]
            for x in knees:
                if x > .05:
                    _queti(g, prefix, p, t, n, x, -1, z+height-.41, length)
                if x < length-.05:
                    _queti(g, prefix, p, t, n, x, 1, z+height-.41, length)

            # Deeply recessed dark timber door/window walls leave open galleries.
            wp, wq = inner[side], inner[(side+1)%20]
            wall_length, wt, wn, wall_angle = _frame(wp, wq)
            wall_bay = wall_length/bays
            lintel = z+height-.83
            for bay in range(bays):
                x0, x1 = bay*wall_bay, (bay+1)*wall_bay
                center = (x0+x1)/2
                doorway = is_ground and side == 0 and bay == 1
                if doorway:
                    door_width = wall_bay*.86
                    door_top = z+min(3.80, height-.86)
                    g.box(prefix+"_entry_shadow", _at(wp, wt, wn, center, .08,
                                                      (z+door_top)/2),
                          (door_width, .07, door_top-z), "window", rot=wall_angle)
                    for xx in (center-door_width/2, center+door_width/2):
                        g.box(prefix+"_entry_frame", _at(wp, wt, wn, xx, -.07,
                                                         (z+door_top)/2),
                              (.16, .22, door_top-z), "red", rot=wall_angle)
                    g.box(prefix+"_entry_frame", _at(wp, wt, wn, center, -.07, door_top),
                          (door_width+.21, .22, .15), "red", rot=wall_angle)
                    if door_top < lintel:
                        g.box(prefix+"_entry_upper_panel", _at(wp, wt, wn, center, 0,
                                                               (door_top+lintel)/2),
                              (wall_bay, .14, lintel-door_top), "darkwood", rot=wall_angle)
                else:
                    window_width = wall_bay*.86
                    # Dark lower panels replace V1's broad plaster dado.
                    g.box(prefix+"_lower_door_panels", _at(wp, wt, wn, center, .03, z+.42),
                          (wall_bay, .15, .80), "darkwood", rot=wall_angle)
                    _lattice_window(g, prefix, wp, wt, wn, wall_angle,
                                    center, window_width, z+.83, lintel)
                    pier = (wall_bay-window_width)/2
                    for xx in (x0+pier/2, x1-pier/2):
                        g.box(prefix+"_timber_wall_piers", _at(wp, wt, wn, xx, .035,
                                                              (z+.80+lintel)/2),
                              (pier, .15, lintel-z-.80), "darkwood", rot=wall_angle)
                # Restrained pale upper lintels are the main visible cream area.
                g.box(prefix+"_cream_lintels", _at(wp, wt, wn, center, .015,
                                                   z+height-.535),
                      (wall_bay+.01, .15, .47), "cream", rot=wall_angle)
                g.box(prefix+"_wall_stiles", _at(wp, wt, wn, x0, -.06,
                                                 z+(height-.27)/2),
                      (.095, .125, height-.27), "red", rot=wall_angle)

        if refined and is_ground:
            # The first-floor portico remains entirely open, with stone plinths
            # at columns only; the separate foundation owns all white balustrades.
            continue
        rp, rq = railing[side], railing[(side+1)%20]
        if short_return:
            _rail_connector(g, prefix, rp, rq, z, refined)
        elif refined:
            _wood_rail(g, prefix, rp, rq, z)
        else:
            _rail(g, prefix, rp, rq, z, front_entrance=(is_ground and side == 0))
