"""Four original hipped-gable roof pavilions for the tower crown.

No Blender or external-resource dependency: only the caller's geometry API is
used.  Height and footprint deliberately leave the central finial unobscured.
"""

from math import cos, pi, sin


def build_crown(g):
    """Add four equal outward-facing roof pavilions, highest point 32.90 m."""
    for direction in range(4):
        angle = direction*pi/2
        ca, sa = cos(angle), sin(angle)
        prefix = "Crown_Pavilion_%d" % (direction+1)

        def pt(x, y, z):
            return (x*ca-y*sa, x*sa+y*ca, z)

        def box(tag, x, y, z, sx, sy, sz, mat):
            g.box(prefix+"_"+tag, pt(x, y, z), (sx, sy, sz), mat, rot=angle)

        def tube(tag, points, radius, mat, sides=8):
            g.tube(prefix+"_"+tag, [pt(*p) for p in points], radius, mat, sides=sides)

        # A small scarlet pavilion projects through the main pyramidal roof.
        box("Wall", 0, -3.92, 30.48, 3.30, 0.55, 1.35, "red")
        box("Front_Recess", 0, -4.225, 30.62, 2.73, 0.045, 0.90, "darkwood")
        for x in (-1.58, 1.58):
            g.cylinder(prefix+"_Columns", pt(x, -4.25, 30.58),
                       0.12, 1.58, "red", sides=12)
            box("Column_Capitals", x, -4.25, 31.28, 0.39, 0.36, 0.14, "gold")
            box("Column_Crossarms", x, -4.25, 31.37, 0.55, 0.28, 0.09, "teal")
        box("Lintel", 0, -4.24, 31.38, 3.61, 0.31, 0.20, "teal")
        box("Lintel_Gold", 0, -4.415, 31.46, 3.69, 0.06, 0.035, "gold")
        # The plain face is reserved for the caller's separately authored text.
        box("Plaque", 0, -4.35, 30.80, 2.50, 0.105, 0.80, "plaque")
        for x in (-1.285, 1.285):
            box("Plaque_Frame", x, -4.415, 30.80, 0.055, 0.035, 0.89, "gold")
        for z in (30.365, 31.235):
            box("Plaque_Frame", 0, -4.415, z, 2.625, 0.035, 0.055, "gold")

        # Lower hipped skirt.  Every side is a regular curved mesh, joined at
        # shared corner positions; eave corners lift to 32.20 m.
        center_y = -4.15
        inner = [(-1.57, -0.49), (1.57, -0.49),
                 (1.57, 0.49), (-1.57, 0.49)]
        outer = [(-2.50, -1.35), (2.50, -1.35),
                 (2.50, 1.35), (-2.50, 1.35)]

        def roof_point(side, u, v, lift=0):
            a, b = inner[side], inner[(side+1) % 4]
            c, d = outer[side], outer[(side+1) % 4]
            ix, iy = a[0]*(1-u)+b[0]*u, a[1]*(1-u)+b[1]*u
            ox, oy = c[0]*(1-u)+d[0]*u, c[1]*(1-u)+d[1]*u
            edge = abs(2*u-1)
            z = 32.18 - 0.98*v + 0.28*v**4 + 0.72*edge**5*v**4
            return (ix*(1-v)+ox*v, center_y+iy*(1-v)+oy*v, z+lift)

        for side in range(4):
            across = 24 if side % 2 == 0 else 14
            rows = 12
            verts = [pt(*roof_point(side, i/across, j/rows))
                     for j in range(rows+1) for i in range(across+1)]
            faces = []
            for j in range(rows):
                for i in range(across):
                    a = j*(across+1)+i
                    faces.append((a, a+across+1, a+across+2, a+1))
            g.poly(prefix+"_Curved_Hip_Roof", verts, faces, "tile")
            # Raised curved tile rolls are actual geometry, including the
            # visible fan of rolls along the narrow hipped end slopes.
            for i in range(across+1):
                path = [roof_point(side, i/across, j/rows, 0.032)
                        for j in range(rows+1)]
                tube("Hip_Tile_Rolls", path, 0.025, "tilelight", sides=6)
            for j in (3, 6, 9):
                tube("Hip_Tile_Joints", [roof_point(side, i/across, j/rows, 0.017)
                                        for i in range(across+1)],
                     0.010, "tileedge", sides=6)
            tube("Eave_Edges", [roof_point(side, i/across, 1, -0.025)
                                for i in range(across+1)], 0.071, "tileedge")
            tube("Eave_Gold", [roof_point(side, i/across, 1, 0.050)
                               for i in range(across+1)], 0.023, "gold")
            tube("Hip_Ridges", [roof_point(side, 0, j/rows, 0.072)
                                for j in range(rows+1)], 0.045, "gold")
            # Short gold finials at each outer wing tip, safely below the ridge.
            x, y, zz = roof_point(side, 0, 1)
            tube("Wing_Tips", [(x, y, zz), (x*1.018, center_y+(y-center_y)*1.026, zz+.10),
                               (x*1.035, center_y+(y-center_y)*1.045, zz+.17)],
                 0.044, "gold")

        # A separate upper saddle creates the characteristic hipped-gable
        # silhouette, with a triangular timber gable exposed at each ridge end.
        for end in (-1, 1):
            x = end*1.60
            triangle = [(x, center_y-.49, 32.17),
                        (x, center_y+.49, 32.17), (x, center_y, 32.82)]
            face = (0, 1, 2) if end > 0 else (2, 1, 0)
            g.poly(prefix+"_Gables", [pt(*v) for v in triangle], [face], "red")
            tube("Gable_Bargeboards", [triangle[0], triangle[2], triangle[1]],
                 0.045, "gold")
            tube("Gable_Timbers", [(x+end*.015, center_y, 32.20),
                                   (x+end*.015, center_y, 32.79)], 0.032, "darkwood")

        def saddle_point(x, v, sign, lift=0):
            # The tiny rising ends stop at the declared 32.90 m maximum.
            ridge = 32.82 + 0.028*(abs(x)/1.82)**4
            z = ridge - 0.80*v + 0.115*v*v
            return (x, center_y+sign*0.62*v, z+lift)

        for sign in (-1, 1):
            nx, ny = 24, 10
            verts = [pt(*saddle_point(-1.82+3.64*i/nx, j/ny, sign))
                     for j in range(ny+1) for i in range(nx+1)]
            faces = []
            for j in range(ny):
                for i in range(nx):
                    a=j*(nx+1)+i
                    face=(a, a+1, a+nx+2, a+nx+1)
                    faces.append(face if sign == 1 else tuple(reversed(face)))
            g.poly(prefix+"_Upper_Gable_Roof", verts, faces, "tile")
            for i in range(nx+1):
                x=-1.82+3.64*i/nx
                tube("Upper_Tile_Rolls", [saddle_point(x, j/ny, sign, .025)
                                         for j in range(ny+1)], .021, "tilelight", sides=6)
            tube("Upper_Eave", [saddle_point(-1.82+3.64*i/nx, 1, sign)
                                for i in range(nx+1)], .050, "tileedge")
        tube("Main_Ridge", [(x, center_y, 32.83+.025*(abs(x)/1.82)**4)
                            for x in [-1.82+3.64*i/24 for i in range(25)]],
             0.044, "gold")
