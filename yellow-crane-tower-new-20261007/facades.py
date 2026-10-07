"""Original, deterministic facade geometry for a Yellow Crane Tower study.

Only the supplied geometry builder is used.  ``z`` is the finished floor level;
``half`` is the half-width of the outer column ring.  All components are grouped
by floor and architectural role so the saved Blender model remains editable.
"""

from math import atan2, cos, hypot, sin


def _ring(half, cut=None):
    cut = half * 0.28 if cut is None else cut
    a = half - cut
    return [(-a, -half), (a, -half), (half, -a), (half, a),
            (a, half), (-a, half), (-half, a), (-half, -a)]


def _frame(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    length = hypot(dx, dy)
    t = (dx / length, dy / length)
    n = (-t[1], t[0])  # Inward normal of the counter-clockwise ring.
    return length, t, n, atan2(dy, dx)


def _at(p, t, n, x, inset, z):
    return (p[0] + t[0] * x + n[0] * inset,
            p[1] + t[1] * x + n[1] * inset, z)


def _prism(g, name, ring, bottom, top, mat):
    count = len(ring)
    verts = [(x, y, bottom) for x, y in ring]
    verts += [(x, y, top) for x, y in ring]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count)
              for i in range(count)]
    g.poly(name, verts, faces, mat)


def _rail(g, prefix, p, q, z, front_entrance=False):
    length, t, n, angle = _frame(p, q)
    # A comfortable promenade railing: substantial posts and two open bands.
    bays = max(1, round(length / 1.35))
    if front_entrance:
        bays = max(5, bays)
        bays += int(bays % 2 == 0)
    gap_bay = bays // 2 if front_entrance else -1
    post_positions = set()
    for bay in range(bays):
        if bay == gap_bay:
            continue
        x0, x1 = length * bay / bays, length * (bay + 1) / bays
        post_positions.update((bay, bay + 1))
        center = (x0 + x1) * 0.5
        span = x1 - x0
        for dz, thick in ((0.20, 0.105), (0.76, 0.105), (0.91, 0.13)):
            g.box(prefix + "_rail_beams", _at(p, t, n, center, 0, z + dz),
                  (span, 0.115, thick), "stone", rot=angle)
        # Three short balusters per bay leave clearly legible openings.
        for j in range(1, 4):
            g.box(prefix + "_rail_balusters", _at(p, t, n, x0 + span*j/4, 0, z+0.48),
                  (0.072, 0.083, 0.49), "stone", rot=angle)
    for index in sorted(post_positions):
        x = length * index / bays
        g.box(prefix + "_rail_posts", _at(p, t, n, x, 0, z + 0.50),
              (0.16, 0.16, 1.0), "stone", rot=angle)
        g.box(prefix + "_rail_caps", _at(p, t, n, x, 0, z + 1.035),
              (0.215, 0.215, 0.085), "stone", rot=angle)


def _lattice_window(g, prefix, p, t, n, angle, center, width, bottom, top):
    middle, height = (bottom + top) / 2, top - bottom
    # Glass/infill is behind every actual solid lattice strip.
    g.box(prefix + "_window_infill", _at(p, t, n, center, 0.018, middle),
          (width, 0.07, height), "window", rot=angle)
    for x in (center - width/2, center + width/2):
        g.box(prefix + "_window_frames", _at(p, t, n, x, -0.045, middle),
              (0.095, 0.10, height+0.10), "darkwood", rot=angle)
    for zz in (bottom, top):
        g.box(prefix + "_window_frames", _at(p, t, n, center, -0.05, zz),
              (width+0.12, 0.11, 0.105), "darkwood", rot=angle)
    for j in range(1, 5):
        g.box(prefix + "_window_lattice", _at(p, t, n, center-width/2+width*j/5,
                                            -0.08, middle),
              (0.035, 0.055, height), "darkwood", rot=angle)
    for j in range(1, 6):
        g.box(prefix + "_window_lattice", _at(p, t, n, center, -0.087,
                                            bottom+height*j/6),
              (width, 0.055, 0.033), "darkwood", rot=angle)
    # Gold-edged lintel and projecting wooden sill give the grid some relief.
    g.box(prefix + "_window_lintels", _at(p, t, n, center, -0.08, top+0.10),
          (width+0.22, 0.16, 0.065), "gold", rot=angle)
    g.box(prefix + "_window_sills", _at(p, t, n, center, -0.10, bottom-0.08),
          (width+0.20, 0.24, 0.11), "red", rot=angle)


def build_floor(g, level: int, z: float, half: float, height: float):
    """Build one tower storey, with no roofs, scene setup, or external inputs."""
    prefix = "Floor_%02d" % level
    is_ground = level <= 1

    # The octagonal projecting balcony and narrow red edge are separate meshes.
    _prism(g, prefix + "_balcony_slab", _ring(half+0.43), z-0.28, z, "stone")
    _prism(g, prefix + "_floor_edge", _ring(half+0.46), z-0.33, z-0.24, "red")
    outer = _ring(half)
    inner = _ring(half-0.80)
    railing = _ring(half+0.26)
    column_radius = max(0.125, half * 0.023)

    for side in range(8):
        p, q = outer[side], outer[(side+1) % 8]
        length, t, n, angle = _frame(p, q)
        bays = 5 if side % 2 == 0 else 1
        bay_width = length / bays

        # Shared corner columns occur only at each edge's starting vertex.
        for station in range(bays):
            x = station * bay_width
            point = _at(p, t, n, x, 0, z)
            g.cylinder(prefix + "_column_bases", (point[0], point[1], z+0.115),
                       column_radius*1.38, 0.23, "stone", sides=12)
            g.cylinder(prefix + "_vermilion_columns",
                       (point[0], point[1], z+0.20+(height-0.48)/2),
                       column_radius, height-0.48, "red", sides=12)
            g.cylinder(prefix + "_column_neck_rings",
                       (point[0], point[1], z+height-0.37),
                       column_radius*1.10, 0.09, "gold", sides=12)
            # Stepped, interlocking transverse arms suggest traditional dougong.
            for tier, width in enumerate((0.39, 0.57, 0.78)):
                zz = z + height - 0.57 + tier * 0.16
                g.box(prefix + "_bracket_blocks", _at(p, t, n, x, 0, zz),
                      (width, 0.23, 0.12), "gold", rot=angle)
                g.box(prefix + "_bracket_arms", _at(p, t, n, x, -0.025, zz+0.065),
                      (0.20, width*0.88, 0.10), "teal", rot=angle)

        for zz, cross, mat, tag in (
                (z+height-0.30, (0.32, 0.31), "red", "structural_beams"),
                (z+height-0.14, (0.39, 0.25), "teal", "painted_fascia"),
                (z+height+0.005, (0.43, 0.045), "gold", "fascia_gold_edges"),
                (z+height-0.275, (0.40, 0.045), "gold", "fascia_gold_edges")):
            g.box(prefix + "_" + tag, _at(p, t, n, length/2, 0, zz),
                  (length+0.02, cross[0], cross[1]), mat, rot=angle)

        # Geometric gold diamonds sit on the outward-facing painted beam.
        for bay in range(bays):
            x = (bay+0.5)*bay_width
            vertices = [_at(p, t, n, x+dx, -0.205, z+height-0.14+dz)
                        for dx, dz in ((-0.14, 0), (0, 0.07), (0.14, 0), (0, -0.07))]
            g.poly(prefix + "_fascia_inlay", vertices, [(3, 2, 1, 0)], "gold")

        # Cream infill panels and repeated recessed lattice windows.
        wp, wq = inner[side], inner[(side+1) % 8]
        wall_length, wt, wn, wall_angle = _frame(wp, wq)
        wall_bay = wall_length / bays
        sill = z + 0.88
        lintel = z + height - 0.78
        for bay in range(bays):
            x0, x1 = bay*wall_bay, (bay+1)*wall_bay
            center = (x0+x1)/2
            doorway = is_ground and side == 0 and bay == bays//2
            if doorway:
                door_width = wall_bay*0.85
                door_top = z+min(2.85, height-0.64)
                g.box(prefix + "_entry_shadow", _at(wp, wt, wn, center, 0.06,
                                                    (z+door_top)/2),
                      (door_width, 0.07, door_top-z), "window", rot=wall_angle)
                for xx in (center-door_width/2, center+door_width/2):
                    g.box(prefix + "_entry_frame", _at(wp, wt, wn, xx, -0.08,
                                                       (z+door_top)/2),
                          (0.17, 0.22, door_top-z), "red", rot=wall_angle)
                g.box(prefix + "_entry_frame", _at(wp, wt, wn, center, -0.08, door_top),
                      (door_width+0.23, 0.23, 0.16), "red", rot=wall_angle)
                g.box(prefix + "_entry_lintel", _at(wp, wt, wn, center, -0.205, door_top+.055),
                      (door_width+0.28, 0.035, 0.04), "gold", rot=wall_angle)
                wall_bottom, wall_top = door_top+0.09, z+height-0.25
                if wall_top > wall_bottom:
                    g.box(prefix + "_cream_walls", _at(wp, wt, wn, center, 0.04,
                                                       (wall_bottom+wall_top)/2),
                          (wall_bay, 0.15, wall_top-wall_bottom), "cream", rot=wall_angle)
            else:
                window_width = max(0.45, wall_bay*0.75)
                for lo, hi in ((z+0.02, sill-0.10), (lintel+0.10, z+height-0.25)):
                    g.box(prefix + "_cream_walls", _at(wp, wt, wn, center, 0.045,
                                                       (lo+hi)/2),
                          (wall_bay+0.01, 0.17, hi-lo), "cream", rot=wall_angle)
                pier_width = (wall_bay-window_width)/2
                for xx in (x0+pier_width/2, x1-pier_width/2):
                    g.box(prefix + "_cream_walls", _at(wp, wt, wn, xx, 0.04,
                                                       (sill+lintel)/2),
                          (pier_width, 0.17, lintel-sill+0.20), "cream", rot=wall_angle)
                _lattice_window(g, prefix, wp, wt, wn, wall_angle,
                                center, window_width, sill, lintel)
            # Thin framing at each panel boundary ties the walls together.
            g.box(prefix + "_wall_stiles", _at(wp, wt, wn, x0, -0.065,
                                               z+(height-0.24)/2),
                  (0.09, 0.12, height-0.24), "red", rot=wall_angle)

        _rail(g, prefix, railing[side], railing[(side+1) % 8], z,
              front_entrance=(is_ground and side == 0))
